"""Reglas de negocio de viajes, asignaciones y despacho (docs/database.md §5 reglas 1, 2, 7, 8, 10 y §6.4).

Toda operación que compromete un vehículo o un conductor:
  1. abre una transacción,
  2. bloquea la fila del viaje y luego la del recurso (siempre en ese orden: evita interbloqueos),
  3. recién entonces busca cruces. El bloqueo es necesario para evitar asignaciones simultáneas incompatibles.
"""
import uuid
from datetime import date, datetime, timedelta

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from api.realtime import publish_event
from apps.audit.services import Accion, registrar
from apps.drivers.models import Conductor, Licencia, TurnoConductor
from apps.fleet.models import DocumentoVehicular, Mantenimiento, TipoDocumentoVehicular, Vehiculo
from apps.operations import config
from apps.reservations.models import Reservation
from apps.routes.models import Horario, Tarifa
from apps.tickets.models import Ticket

from .errors import Conflicto, ReglaNoCumplida
from .models import AsignacionConductor, Viaje, ViajeEstadoHistorial

E = Viaje.Estado
EDITABLES = (E.PROGRAMADO, E.CONFIRMADO)  # mientras no sale, se puede cambiar lo asignado
TRANSICIONES = {
    E.PROGRAMADO: {E.CONFIRMADO, E.CANCELADO},
    E.CONFIRMADO: {E.EN_EMBARQUE, E.CANCELADO},
    E.EN_EMBARQUE: {E.EN_RUTA, E.CANCELADO},
    E.EN_RUTA: {E.RETRASADO, E.FINALIZADO},
    E.RETRASADO: {E.EN_RUTA, E.FINALIZADO},
    E.FINALIZADO: set(),
    E.CANCELADO: set(),
}
EXIGEN_MOTIVO = {E.RETRASADO, E.CANCELADO}
MAX_DIAS_GENERACION = 62


def _fmt(dt) -> str:
    return timezone.localtime(dt).strftime("%d/%m/%Y %H:%M")


def _fecha(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _dia_local(dt) -> date:
    return timezone.localtime(dt).date()


def _margen() -> timedelta:
    return timedelta(minutes=config.entero("margen_entre_viajes_min"))


# --------------------------------------------------------------------------- precios y creación
def tarifa_vigente(ruta, tipo_servicio, dia: date):
    return (
        Tarifa.objects.filter(ruta=ruta, tipo_servicio=tipo_servicio, activa=True, vigente_desde__lte=dia)
        .filter(Q(vigente_hasta__isnull=True) | Q(vigente_hasta__gte=dia))
        .order_by("-vigente_desde")
        .first()
    )


def _historial(viaje, anterior, nuevo, usuario, observacion=""):
    ViajeEstadoHistorial.objects.create(
        viaje=viaje, estado_anterior=anterior, estado_nuevo=nuevo, cambiado_por=usuario, observacion=observacion[:255]
    )


def _avisar(viaje) -> None:
    """Aviso en tiempo real (solo para refrescar pantallas; los datos reales los decide Django)."""
    publish_event("trip.status_changed", {"trip_id": viaje.pk, "status": viaje.estado})


def _crear(*, ruta, tipo_servicio, salida, precio, usuario, horario=None, observaciones=""):
    viaje = Viaje.objects.create(
        codigo=uuid.uuid4().hex[:20], ruta=ruta, tipo_servicio=tipo_servicio, horario=horario,
        salida_programada=salida, llegada_programada=salida + timedelta(minutes=ruta.duracion_min),
        precio_base=precio, observaciones=observaciones, creado_por=usuario,
    )
    viaje.codigo = f"V{viaje.pk:07d}"
    viaje.save(update_fields=["codigo"])
    _historial(viaje, None, E.PROGRAMADO, usuario, "Viaje creado")
    return viaje


def crear_viaje(*, ruta, tipo_servicio, salida_programada, precio_base=None, observaciones="", usuario, request=None):
    """Viaje suelto (sin horario). Si no se indica precio se toma la tarifa vigente ese día."""
    errores = []
    if not ruta.activa:
        errores.append("La ruta está desactivada.")
    if not tipo_servicio.activo:
        errores.append("El tipo de servicio está desactivado.")
    if salida_programada <= timezone.now():
        errores.append("La salida debe ser en el futuro.")
    if errores:
        raise ReglaNoCumplida(errores)
    if precio_base is None:
        tarifa = tarifa_vigente(ruta, tipo_servicio, _dia_local(salida_programada))
        if tarifa is None:
            raise ReglaNoCumplida("No hay una tarifa vigente para esa ruta, servicio y fecha. Crea la tarifa o indica el precio.")
        precio_base = tarifa.monto
    with transaction.atomic():
        viaje = _crear(ruta=ruta, tipo_servicio=tipo_servicio, salida=salida_programada, precio=precio_base,
                       usuario=usuario, observaciones=observaciones)
    registrar(request=request, accion=Accion.CREAR, entidad="viaje", entidad_id=viaje.pk,
              cambios={"codigo": viaje.codigo, "ruta": ruta.codigo, "salida": viaje.salida_programada.isoformat(),
                       "precio_base": str(precio_base)})
    return viaje


def generar_viajes(*, desde: date, hasta: date, usuario, request=None):
    """Crea los viajes que dicen los horarios activos entre dos fechas. Se puede repetir sin duplicar."""
    if hasta < desde:
        raise ReglaNoCumplida("La fecha final no puede ser anterior a la inicial.")
    if (hasta - desde).days + 1 > MAX_DIAS_GENERACION:
        raise ReglaNoCumplida(f"Máximo {MAX_DIAS_GENERACION} días por vez.")
    ahora = timezone.now()
    zona = timezone.get_current_timezone()
    horarios = list(
        Horario.objects.filter(activo=True, ruta__activa=True, tipo_servicio__activo=True, vigente_desde__lte=hasta)
        .filter(Q(vigente_hasta__isnull=True) | Q(vigente_hasta__gte=desde))
        .select_related("ruta", "tipo_servicio")
    )
    resumen = {"creados": 0, "ya_existian": 0, "en_el_pasado": 0, "sin_tarifa": []}
    sin_tarifa = set()
    dia = desde
    while dia <= hasta:
        for h in horarios:
            if dia < h.vigente_desde or (h.vigente_hasta and dia > h.vigente_hasta):
                continue
            if not h.dias_semana & (1 << dia.weekday()):  # lunes=0 → bit 1
                continue
            salida = timezone.make_aware(datetime.combine(dia, h.hora_salida), zona)
            if salida <= ahora:
                resumen["en_el_pasado"] += 1
                continue
            if Viaje.objects.filter(horario=h, salida_programada=salida).exists():
                resumen["ya_existian"] += 1
                continue
            tarifa = tarifa_vigente(h.ruta, h.tipo_servicio, dia)
            if tarifa is None:
                sin_tarifa.add(f"{h.ruta.codigo} · {h.tipo_servicio.nombre} ({_fecha(dia)})")
                continue
            try:
                with transaction.atomic():
                    _crear(ruta=h.ruta, tipo_servicio=h.tipo_servicio, salida=salida, precio=tarifa.monto,
                           usuario=usuario, horario=h)
                resumen["creados"] += 1
            except IntegrityError:  # otro usuario lo generó a la vez
                resumen["ya_existian"] += 1
        dia += timedelta(days=1)
    resumen["sin_tarifa"] = sorted(sin_tarifa)
    registrar(request=request, accion=Accion.CREAR, entidad="viaje",
              cambios={"generacion": f"{desde} a {hasta}", **{k: v for k, v in resumen.items() if k != "sin_tarifa"},
                       "sin_tarifa": len(resumen["sin_tarifa"])})
    return resumen


# --------------------------------------------------------------------------- verificaciones
def verificar_vehiculo(vehiculo: Vehiculo, viaje: Viaje):
    """Devuelve (conflictos, incumplimientos): lo que choca con otros viajes y lo que no cumple requisitos."""
    conflictos, faltas = [], []
    if not vehiculo.activo:
        faltas.append(f"El vehículo {vehiculo.placa} está desactivado.")
    if vehiculo.estado in (Vehiculo.Estado.MANTENIMIENTO, Vehiculo.Estado.FUERA_DE_SERVICIO):
        faltas.append(f"El vehículo {vehiculo.placa} está {vehiculo.get_estado_display().lower()}.")
    if vehiculo.tipo_servicio_id != viaje.tipo_servicio_id:
        faltas.append(f"El vehículo es de servicio «{vehiculo.tipo_servicio.nombre}» y el viaje es «{viaje.tipo_servicio.nombre}».")

    m = _margen()
    for otro in Viaje.objects.filter(vehiculo=vehiculo, estado__in=Viaje.ACTIVOS).exclude(pk=viaje.pk).filter(
        salida_programada__lt=viaje.llegada_programada + m, llegada_programada__gt=viaje.salida_programada - m
    ):
        conflictos.append(
            f"El vehículo {vehiculo.placa} ya está en el viaje {otro.codigo} ({_fmt(otro.salida_programada)} a "
            f"{_fmt(otro.llegada_programada)}), con margen de {int(m.total_seconds() // 60)} min."
        )

    dia_sale, dia_llega = _dia_local(viaje.salida_programada), _dia_local(viaje.llegada_programada)
    for man in Mantenimiento.objects.filter(vehiculo=vehiculo, estado__in=["PROGRAMADO", "EN_PROCESO"], fecha_inicio__lte=dia_llega).filter(
        Q(fecha_fin__gte=dia_sale)
        | Q(fecha_fin__isnull=True, estado="EN_PROCESO")
        | Q(fecha_fin__isnull=True, estado="PROGRAMADO", fecha_inicio__gte=dia_sale)
    ):
        faltas.append(f"El vehículo {vehiculo.placa} tiene mantenimiento «{man.descripcion}» desde el {_fecha(man.fecha_inicio)}.")

    for tipo in TipoDocumentoVehicular.objects.filter(bloquea_asignacion=True):
        docs = DocumentoVehicular.objects.filter(vehiculo=vehiculo, tipo=tipo)
        if docs.filter(fecha_vencimiento__gte=dia_llega).exists():
            continue
        ultimo = docs.order_by("-fecha_vencimiento").first()
        if ultimo is None:
            faltas.append(f"El vehículo {vehiculo.placa} no tiene {tipo.nombre} registrado.")
        else:
            faltas.append(f"{tipo.nombre} del vehículo {vehiculo.placa} vence el {_fecha(ultimo.fecha_vencimiento)}, antes de terminar el viaje.")
    return conflictos, faltas


def verificar_conductor(conductor: Conductor, viaje: Viaje):
    conflictos, faltas = [], []
    nombre = str(conductor)
    if not conductor.activo:
        faltas.append(f"El conductor {nombre} está desactivado.")

    dia_llega = _dia_local(viaje.llegada_programada)
    permitidas = config.categorias_licencia_permitidas()
    activas = Licencia.objects.filter(conductor=conductor, activa=True)
    if not activas.exists():
        faltas.append(f"El conductor {nombre} no tiene licencia activa.")
    elif not activas.filter(fecha_vencimiento__gte=dia_llega).exists():
        ultima = activas.order_by("-fecha_vencimiento").first()
        faltas.append(f"La licencia de {nombre} vence el {_fecha(ultima.fecha_vencimiento)}, antes de terminar el viaje.")
    elif not activas.filter(fecha_vencimiento__gte=dia_llega, categoria__in=permitidas).exists():
        faltas.append(f"La categoría de licencia de {nombre} no está permitida para buses ({', '.join(sorted(permitidas))}).")

    for t in TurnoConductor.objects.filter(conductor=conductor, tipo__in=["DESCANSO", "VACACIONES"],
                                           inicio__lt=viaje.llegada_programada, fin__gt=viaje.salida_programada):
        faltas.append(f"{nombre} está de {t.get_tipo_display().lower()} del {_fmt(t.inicio)} al {_fmt(t.fin)}.")

    # Descanso: entre dos viajes del mismo conductor debe haber, como mínimo, el descanso configurado.
    gap = max(_margen(), timedelta(hours=config.entero("descanso_minimo_conductor_horas")))
    for a in AsignacionConductor.objects.filter(
        conductor=conductor, activa=True, viaje__estado__in=Viaje.ACTIVOS,
        viaje__salida_programada__lt=viaje.llegada_programada + gap, viaje__llegada_programada__gt=viaje.salida_programada - gap,
    ).exclude(viaje=viaje).select_related("viaje"):
        conflictos.append(
            f"{nombre} ya está en el viaje {a.viaje.codigo} ({_fmt(a.viaje.salida_programada)} a "
            f"{_fmt(a.viaje.llegada_programada)}); se exige un descanso de {int(gap.total_seconds() // 3600)} h entre viajes."
        )
    return conflictos, faltas


def _lanzar(conflictos, faltas):
    if conflictos:
        raise Conflicto(conflictos + faltas)
    if faltas:
        raise ReglaNoCumplida(faltas)


def _bloquear_viaje(viaje_id) -> Viaje:
    return Viaje.objects.select_for_update().select_related("ruta", "tipo_servicio", "vehiculo").get(pk=viaje_id)


def _exigir_editable(viaje: Viaje, que: str):
    if viaje.estado not in EDITABLES:
        raise ReglaNoCumplida(f"No se puede {que}: el viaje está «{viaje.get_estado_display()}». Solo se cambia mientras está programado o confirmado.")


# --------------------------------------------------------------------------- asignaciones
def asignar_vehiculo(viaje_id: int, vehiculo_id, usuario, request=None) -> Viaje:
    with transaction.atomic():
        viaje = _bloquear_viaje(viaje_id)
        _exigir_editable(viaje, "cambiar el vehículo")
        anterior = viaje.vehiculo.placa if viaje.vehiculo_id else None
        if vehiculo_id is None:
            viaje.vehiculo = None
            nuevo = None
        else:
            vehiculo = Vehiculo.objects.select_for_update().select_related("tipo_servicio").get(pk=vehiculo_id)
            _lanzar(*verificar_vehiculo(vehiculo, viaje))
            viaje.vehiculo = vehiculo
            nuevo = vehiculo.placa
        viaje.save(update_fields=["vehiculo", "updated_at"])
        _historial(viaje, viaje.estado, viaje.estado, usuario, f"Vehículo: {anterior or 'ninguno'} → {nuevo or 'ninguno'}")
    registrar(request=request, accion=Accion.MODIFICAR, entidad="viaje", entidad_id=viaje.pk, cambios={"vehiculo": [anterior, nuevo]})
    _avisar(viaje)
    return viaje


def asignar_conductor(viaje_id: int, conductor_id: int, rol: str, usuario, request=None) -> Viaje:
    with transaction.atomic():
        viaje = _bloquear_viaje(viaje_id)
        _exigir_editable(viaje, "asignar conductores")
        conductor = Conductor.objects.select_for_update().get(pk=conductor_id)
        existente = AsignacionConductor.objects.filter(viaje=viaje, conductor=conductor).first()
        if existente and existente.activa:
            raise ReglaNoCumplida(f"{conductor} ya está asignado a este viaje.")
        if rol == AsignacionConductor.Rol.PRINCIPAL and AsignacionConductor.objects.filter(
            viaje=viaje, activa=True, rol=AsignacionConductor.Rol.PRINCIPAL
        ).exists():
            raise ReglaNoCumplida("El viaje ya tiene conductor principal. Quítalo antes de asignar otro.")
        _lanzar(*verificar_conductor(conductor, viaje))
        if existente:
            existente.activa, existente.rol, existente.asignado_por = True, rol, usuario
            existente.save(update_fields=["activa", "rol", "asignado_por", "updated_at"])
        else:
            AsignacionConductor.objects.create(viaje=viaje, conductor=conductor, rol=rol, asignado_por=usuario)
        _historial(viaje, viaje.estado, viaje.estado, usuario, f"Conductor asignado ({rol.lower()}): {conductor}")
    registrar(request=request, accion=Accion.MODIFICAR, entidad="viaje", entidad_id=viaje.pk,
              cambios={"conductor_asignado": [None, f"{conductor} ({rol})"]})
    _avisar(viaje)
    return viaje


def quitar_conductor(viaje_id: int, conductor_id: int, usuario, request=None) -> Viaje:
    with transaction.atomic():
        viaje = _bloquear_viaje(viaje_id)
        _exigir_editable(viaje, "quitar conductores")
        asignacion = AsignacionConductor.objects.select_related("conductor").filter(viaje=viaje, conductor_id=conductor_id, activa=True).first()
        if asignacion is None:
            raise ReglaNoCumplida("Ese conductor no está asignado a este viaje.")
        asignacion.activa = False
        asignacion.save(update_fields=["activa", "updated_at"])
        _historial(viaje, viaje.estado, viaje.estado, usuario, f"Conductor quitado: {asignacion.conductor}")
    registrar(request=request, accion=Accion.MODIFICAR, entidad="viaje", entidad_id=viaje.pk,
              cambios={"conductor_asignado": [str(asignacion.conductor), None]})
    _avisar(viaje)
    return viaje


# --------------------------------------------------------------------------- edición y estados
def editar_viaje(viaje_id: int, datos: dict, usuario, request=None) -> Viaje:
    with transaction.atomic():
        viaje = _bloquear_viaje(viaje_id)
        _exigir_editable(viaje, "editar el viaje")
        antes = {k: str(getattr(viaje, k)) for k in datos}
        if "salida_programada" in datos and datos["salida_programada"] != viaje.salida_programada:
            if viaje.vehiculo_id or viaje.asignaciones.filter(activa=True).exists():
                raise ReglaNoCumplida("Para cambiar la hora quita primero el vehículo y los conductores; así se vuelven a validar los cruces.")
            if datos["salida_programada"] <= timezone.now():
                raise ReglaNoCumplida("La salida debe ser en el futuro.")
            viaje.salida_programada = datos["salida_programada"]
            viaje.llegada_programada = viaje.salida_programada + timedelta(minutes=viaje.ruta.duracion_min)
        for campo in ("precio_base", "observaciones"):
            if campo in datos:
                setattr(viaje, campo, datos[campo])
        try:
            viaje.save()
        except IntegrityError:
            raise ReglaNoCumplida("Ya existe un viaje de ese horario a esa hora.") from None
    despues = {k: str(getattr(viaje, k)) for k in datos}
    cambios = {k: [antes[k], despues[k]] for k in datos if antes[k] != despues[k]}
    if cambios:
        registrar(request=request, accion=Accion.MODIFICAR, entidad="viaje", entidad_id=viaje.pk, cambios=cambios)
    return viaje


def _liberar_vehiculo_si_corresponde(viaje: Viaje):
    if viaje.vehiculo_id is None:
        return
    sigue_ocupado = Viaje.objects.filter(vehiculo_id=viaje.vehiculo_id, estado__in=[E.EN_EMBARQUE, E.EN_RUTA, E.RETRASADO]).exclude(pk=viaje.pk).exists()
    if not sigue_ocupado:
        Vehiculo.objects.filter(pk=viaje.vehiculo_id, estado=Vehiculo.Estado.EN_VIAJE).update(estado=Vehiculo.Estado.DISPONIBLE)


def cambiar_estado(viaje_id: int, nuevo: str, usuario, observacion: str = "", request=None) -> Viaje:
    nuevo = E(nuevo)
    observacion = (observacion or "").strip()
    asientos_liberados = []
    with transaction.atomic():
        viaje = _bloquear_viaje(viaje_id)
        anterior = E(viaje.estado)
        if nuevo not in TRANSICIONES[anterior]:
            permitidos = ", ".join(sorted(e.label for e in TRANSICIONES[anterior])) or "ninguno (estado final)"
            raise ReglaNoCumplida(f"No se puede pasar de «{anterior.label}» a «{nuevo.label}». Estados permitidos: {permitidos}.")
        if nuevo in EXIGEN_MOTIVO and not observacion:
            raise ReglaNoCumplida(f"Indica el motivo para pasar a «{nuevo.label}».")

        principal = viaje.asignaciones.select_related("conductor").filter(activa=True, rol=AsignacionConductor.Rol.PRINCIPAL).first()
        if nuevo in (E.CONFIRMADO, E.EN_EMBARQUE):
            faltantes = []
            if viaje.vehiculo_id is None:
                faltantes.append("Asigna un vehículo.")
            if principal is None:
                faltantes.append("Asigna un conductor principal.")
            if faltantes:
                raise ReglaNoCumplida([f"No se puede pasar a «{nuevo.label}»:"] + faltantes)

        if nuevo == E.EN_EMBARQUE:
            # Regla 7: se vuelve a comprobar que vehículo y conductor siguen habilitados AHORA.
            vehiculo = Vehiculo.objects.select_for_update().select_related("tipo_servicio").get(pk=viaje.vehiculo_id)
            conductor = Conductor.objects.select_for_update().get(pk=principal.conductor_id)
            conflictos, faltas = verificar_vehiculo(vehiculo, viaje)
            c2, f2 = verificar_conductor(conductor, viaje)
            if vehiculo.estado == Vehiculo.Estado.EN_VIAJE:
                faltas.append(f"El vehículo {vehiculo.placa} sigue en otro viaje; finalízalo primero.")
            _lanzar(conflictos + c2, faltas + f2)
            vehiculo.estado = Vehiculo.Estado.EN_VIAJE
            vehiculo.save(update_fields=["estado", "updated_at"])

        ahora = timezone.now()
        if nuevo == E.EN_RUTA and viaje.salida_real is None:
            viaje.salida_real = ahora
        if nuevo == E.FINALIZADO:
            viaje.llegada_real = ahora
        viaje.estado = nuevo
        viaje.save()
        if nuevo == E.CANCELADO:
            reservas_activas = Reservation.objects.select_for_update().filter(
                trip=viaje,
                status__in=("PENDING", "CONFIRMED"),
            )
            reserva_ids = list(reservas_activas.values_list("pk", flat=True))
            asientos_liberados = [
                seat_number
                for seat_number in reservas_activas.values_list("seats__seat_number", flat=True)
                if seat_number is not None
            ]
            reservas_activas.update(status="CANCELLED")
            Ticket.objects.filter(
                reservation_id__in=reserva_ids,
                status__in=("RESERVED", "PAID", "BOARDED"),
            ).update(status="CANCELLED")
        if nuevo in (E.FINALIZADO, E.CANCELADO):
            _liberar_vehiculo_si_corresponde(viaje)
        _historial(viaje, anterior, nuevo, usuario, observacion)
    if nuevo == E.CANCELADO:
        for seat_number in sorted(set(asientos_liberados)):
            publish_event(
                "seat.updated",
                {"trip_id": viaje.pk, "seat_number": seat_number, "status": "available"},
            )
    registrar(request=request, accion=Accion.CANCELAR if nuevo == E.CANCELADO else Accion.MODIFICAR, entidad="viaje",
              entidad_id=viaje.pk, cambios={"estado": [anterior.value, nuevo.value], "observacion": observacion})
    _avisar(viaje)
    return viaje
