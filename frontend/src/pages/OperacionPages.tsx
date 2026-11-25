import { ResourceManager, type Column } from '@/components/ResourceManager'
import { Tabs } from '@/components/Tabs'
import { diasTexto, formatDate, formatDateTime, type FieldDef, type Item } from '@/utils/forms'

const s = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : String(v))
const txt = (key: string) => (i: Item) => s(i[key])
const fecha = (key: string) => (i: Item) => formatDate(i[key])
const col = (header: string, cell: Column['cell']): Column => ({ header, cell })
const duracion = (i: Item) => {
  const minutos = Number(i.duracion_min)
  if (!Number.isFinite(minutos) || minutos <= 0) return '—'
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  const texto = [horas > 0 ? `${horas} h` : '', resto > 0 ? `${resto} min` : ''].filter(Boolean).join(' ')
  return `${texto} aprox.`
}

// Listas desplegables alimentadas por la API (constantes a nivel de módulo: identidad estable).
const CIUDADES = { endpoint: '/ciudades/', params: { activa: 'true' }, label: (i: Item) => `${s(i.nombre)} · ${s(i.provincia)}, ${s(i.departamento)}` }
const RUTAS = { endpoint: '/rutas/', params: { activa: 'true' }, label: (i: Item) => `${s(i.codigo)} · ${s(i.nombre)}` }
const SERVICIOS = { endpoint: '/tipos-servicio/', params: { activo: 'true' }, label: (i: Item) => s(i.nombre) }
const VEHICULOS = { endpoint: '/vehiculos/', params: { activo: 'true' }, label: (i: Item) => `${s(i.placa)} · ${s(i.marca)} ${s(i.modelo)}` }
const DISTRIBUCIONES = { endpoint: '/configuraciones-asientos/', label: (i: Item) => `${s(i.nombre)} (${s(i.total_asientos)} asientos)` }
const TIPOS_DOC = { endpoint: '/tipos-documento-vehicular/', label: (i: Item) => s(i.nombre) }
const CONDUCTORES = { endpoint: '/conductores/', params: { activo: 'true' }, label: (i: Item) => `${s(i.apellidos)}, ${s(i.nombres)} (${s(i.dni)})` }
const USUARIOS_CONDUCTOR = { endpoint: '/usuarios/', params: { rol: 'conductor', is_active: 'true' }, label: (i: Item) => `${s(i.username)} · ${s(i.first_name)} ${s(i.last_name)}` }

function Encabezado({ modulo, titulo, texto }: { modulo: string; titulo: string; texto: string }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">{modulo}</p>
      <h1 className="text-2xl font-bold text-navy">{titulo}</h1>
      <p className="text-sm text-slate-500">{texto}</p>
    </div>
  )
}

const ESTADOS_VEHICULO = [
  { value: 'DISPONIBLE', label: 'Disponible' },
  { value: 'MANTENIMIENTO', label: 'En mantenimiento' },
  { value: 'FUERA_DE_SERVICIO', label: 'Fuera de servicio' },
]
const ETIQUETA_ESTADO: Record<string, string> = {
  DISPONIBLE: 'Disponible', EN_VIAJE: 'En viaje', MANTENIMIENTO: 'En mantenimiento', FUERA_DE_SERVICIO: 'Fuera de servicio',
}

const SITUACION: Record<string, { texto: string; clase: string }> = {
  VIGENTE: { texto: 'Vigente', clase: 'bg-emerald-100 text-emerald-800' },
  POR_VENCER: { texto: 'Por vencer', clase: 'bg-amber-100 text-amber-800' },
  VENCIDO: { texto: 'Vencido', clase: 'bg-red-100 text-red-800' },
}

// ------------------------------------------------------------------ Rutas
const camposRuta: FieldDef[] = [
  { name: 'codigo', label: 'Código', type: 'text', required: true, placeholder: 'MOY-TAR' },
  { name: 'nombre', label: 'Nombre', type: 'text', required: true },
  { name: 'origen', label: 'Origen', type: 'select', required: true, optionsFrom: CIUDADES },
  { name: 'destino', label: 'Destino', type: 'select', required: true, optionsFrom: CIUDADES },
  { name: 'duracion_min', label: 'Duración (minutos)', type: 'number', required: true, step: '1' },
  { name: 'distancia_km', label: 'Distancia (km)', type: 'number', step: '0.1' },
]
const camposParada: FieldDef[] = [
  { name: 'ruta', label: 'Ruta', type: 'select', required: true, optionsFrom: RUTAS },
  { name: 'ciudad', label: 'Ciudad de la parada', type: 'select', required: true, optionsFrom: CIUDADES },
  { name: 'orden', label: 'Orden', type: 'number', required: true, step: '1', help: '1 = primera parada después del origen' },
  { name: 'minutos_desde_origen', label: 'Minutos desde el origen', type: 'number', required: true, step: '1' },
  { name: 'direccion', label: 'Dirección', type: 'text' },
]
const camposTarifa: FieldDef[] = [
  { name: 'ruta', label: 'Ruta', type: 'select', required: true, optionsFrom: RUTAS },
  { name: 'tipo_servicio', label: 'Servicio', type: 'select', required: true, optionsFrom: SERVICIOS },
  { name: 'monto', label: 'Precio referencial desde (S/)', type: 'number', required: true, step: '0.01' },
  { name: 'vigente_desde', label: 'Vigente desde', type: 'date', required: true },
  { name: 'vigente_hasta', label: 'Vigente hasta', type: 'date', help: 'Vacío = sin fecha de fin' },
]

export function RutasPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado modulo="Operación y despacho" titulo="Rutas" texto="Rutas, paradas intermedias, tarifas referenciales, ciudades y tipos de servicio." />
      <Tabs tabs={[
        { id: 'rutas', label: 'Rutas', element: (
          <ResourceManager endpoint="/rutas/" singular="ruta" activeKey="activa" fields={camposRuta}
            intro="Una ruta une dos ciudades. Desactívala en lugar de borrarla: el historial se conserva."
            columns={[col('Código', txt('codigo')), col('Nombre', txt('nombre')), col('Origen → Destino', (i) => `${s(i.origen_nombre)} → ${s(i.destino_nombre)}`), col('Duración referencial', duracion), col('Km', txt('distancia_km'))]} />) },
        { id: 'paradas', label: 'Paradas', element: (
          <ResourceManager endpoint="/paradas/" singular="parada" fields={camposParada}
            intro="Paradas intermedias (informativas: el asiento se vende para el viaje completo)."
            columns={[col('Ruta', txt('ruta_codigo')), col('Orden', txt('orden')), col('Ciudad', txt('ciudad_nombre')), col('Min. desde origen', txt('minutos_desde_origen')), col('Dirección', txt('direccion'))]} />) },
        { id: 'tarifas', label: 'Tarifas', element: (
          <ResourceManager endpoint="/tarifas/" singular="tarifa" activeKey="activa" fields={camposTarifa}
            intro="Precio base referencial por ruta y servicio. Confirma la tarifa comercial antes de cualquier operación real."
            columns={[col('Ruta', txt('ruta_nombre')), col('Servicio', txt('tipo_servicio_nombre')), col('Desde (S/)', (i) => `S/ ${s(i.monto)}`), col('Vigente desde', fecha('vigente_desde')), col('Vigente hasta', (i) => (i.vigente_hasta ? formatDate(i.vigente_hasta) : 'Sin fin'))]} />) },
        { id: 'ciudades', label: 'Ciudades', element: (
          <ResourceManager endpoint="/ciudades/" singular="ciudad" activeKey="activa"
            fields={[
              { name: 'nombre', label: 'Ciudad o localidad', type: 'text', required: true },
              { name: 'provincia', label: 'Provincia', type: 'text', required: true },
              { name: 'departamento', label: 'Departamento', type: 'text', required: true },
              { name: 'observaciones', label: 'Agencia / referencia', type: 'text' },
            ]}
            columns={[col('Ciudad o localidad', txt('nombre')), col('Provincia', txt('provincia')), col('Departamento', txt('departamento')), col('Agencia / referencia', txt('observaciones'))]} />) },
        { id: 'servicios', label: 'Tipos de servicio', element: (
          <ResourceManager endpoint="/tipos-servicio/" singular="tipo de servicio" activeKey="activo"
            fields={[{ name: 'codigo', label: 'Código', type: 'text', required: true, placeholder: 'BUS_CAMA' }, { name: 'nombre', label: 'Nombre', type: 'text', required: true }, { name: 'descripcion', label: 'Descripción', type: 'text' }]}
            columns={[col('Código', txt('codigo')), col('Nombre', txt('nombre')), col('Descripción', txt('descripcion'))]} />) },
      ]} />
    </div>
  )
}

// ---------------------------------------------------------------- Horarios
const camposHorario: FieldDef[] = [
  { name: 'ruta', label: 'Ruta', type: 'select', required: true, optionsFrom: RUTAS },
  { name: 'tipo_servicio', label: 'Servicio', type: 'select', required: true, optionsFrom: SERVICIOS },
  { name: 'hora_salida', label: 'Hora de salida', type: 'time', required: true },
  { name: 'vigente_desde', label: 'Vigente desde', type: 'date', required: true },
  { name: 'vigente_hasta', label: 'Vigente hasta', type: 'date', help: 'Vacío = sin fecha de fin' },
  { name: 'dias_semana', label: 'Días de salida', type: 'weekdays' },
]

export function HorariosPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado modulo="Operación y despacho" titulo="Horarios" texto="Plantillas de salida recurrentes. De aquí se generarán los viajes programados." />
      <ResourceManager endpoint="/horarios/" singular="horario" activeKey="activo" fields={camposHorario}
        columns={[col('Ruta', txt('ruta_nombre')), col('Servicio', txt('tipo_servicio_nombre')), col('Salida', (i) => s(i.hora_salida).slice(0, 5)), col('Días', (i) => diasTexto(Number(i.dias_semana))), col('Vigencia', (i) => `${formatDate(i.vigente_desde)} → ${i.vigente_hasta ? formatDate(i.vigente_hasta) : 'sin fin'}`)]} />
    </div>
  )
}

// ---------------------------------------------------------------- Vehículos
const camposVehiculo: FieldDef[] = [
  { name: 'placa', label: 'Placa', type: 'text', required: true, placeholder: 'ABC-123' },
  { name: 'marca', label: 'Marca', type: 'text', required: true },
  { name: 'modelo', label: 'Modelo', type: 'text', required: true },
  { name: 'anio', label: 'Año', type: 'number', required: true, step: '1' },
  { name: 'configuracion_asientos', label: 'Distribución de asientos', type: 'select', required: true, optionsFrom: DISTRIBUCIONES, help: 'Se crean en la pestaña «Distribución de asientos»' },
  { name: 'tipo_servicio', label: 'Servicio', type: 'select', required: true, optionsFrom: SERVICIOS },
  { name: 'kilometraje', label: 'Kilometraje', type: 'number', step: '1' },
  { name: 'estado', label: 'Estado', type: 'select', required: true, options: ESTADOS_VEHICULO, defaultValue: 'DISPONIBLE', help: '«En viaje» lo asigna el sistema al despachar.' },
]
const camposDocumento: FieldDef[] = [
  { name: 'vehiculo', label: 'Vehículo', type: 'select', required: true, optionsFrom: VEHICULOS },
  { name: 'tipo', label: 'Tipo de documento', type: 'select', required: true, optionsFrom: TIPOS_DOC },
  { name: 'numero', label: 'Número', type: 'text', required: true },
  { name: 'fecha_emision', label: 'Emisión', type: 'date', required: true },
  { name: 'fecha_vencimiento', label: 'Vencimiento', type: 'date', required: true },
]
const camposMantenimiento: FieldDef[] = [
  { name: 'vehiculo', label: 'Vehículo', type: 'select', required: true, optionsFrom: VEHICULOS },
  { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: [{ value: 'PREVENTIVO', label: 'Preventivo' }, { value: 'CORRECTIVO', label: 'Correctivo' }] },
  { name: 'estado', label: 'Estado', type: 'select', required: true, defaultValue: 'PROGRAMADO', options: [{ value: 'PROGRAMADO', label: 'Programado' }, { value: 'EN_PROCESO', label: 'En proceso' }, { value: 'COMPLETADO', label: 'Completado' }, { value: 'CANCELADO', label: 'Cancelado' }] },
  { name: 'descripcion', label: 'Descripción', type: 'text', required: true },
  { name: 'fecha_inicio', label: 'Inicio', type: 'date', required: true },
  { name: 'fecha_fin', label: 'Fin', type: 'date' },
  { name: 'kilometraje', label: 'Kilometraje', type: 'number', step: '1' },
  { name: 'costo', label: 'Costo (S/)', type: 'number', step: '0.01' },
  { name: 'proveedor', label: 'Proveedor / taller', type: 'text' },
]

export function VehiculosPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado modulo="Operación y despacho" titulo="Vehículos" texto="Flota, distribución de asientos, documentos y mantenimientos." />
      <Tabs tabs={[
        { id: 'vehiculos', label: 'Vehículos', element: (
          <ResourceManager endpoint="/vehiculos/" singular="vehículo" activeKey="activo" fields={camposVehiculo}
            columns={[col('Placa', txt('placa')), col('Marca / modelo', (i) => `${s(i.marca)} ${s(i.modelo)} (${s(i.anio)})`), col('Servicio', txt('tipo_servicio_nombre')), col('Asientos', txt('capacidad')), col('Situación', (i) => ETIQUETA_ESTADO[String(i.estado)] ?? s(i.estado))]} />) },
        { id: 'documentos', label: 'Documentos', element: (
          <ResourceManager endpoint="/documentos-vehiculares/" singular="documento" fields={camposDocumento}
            intro="SOAT y revisión técnica vencidos bloquearán la asignación del vehículo a viajes."
            columns={[col('Vehículo', txt('vehiculo_placa')), col('Documento', txt('tipo_nombre')), col('Número', txt('numero')), col('Vence', fecha('fecha_vencimiento')),
              col('Situación', (i) => { const x = SITUACION[String(i.situacion)]; return x ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${x.clase}`}>{x.texto}{i.situacion === 'POR_VENCER' ? ` (${s(i.dias_para_vencer)} d)` : ''}</span> : '—' })]} />) },
        { id: 'mantenimientos', label: 'Mantenimientos', element: (
          <ResourceManager endpoint="/mantenimientos/" singular="mantenimiento" fields={camposMantenimiento}
            columns={[col('Vehículo', txt('vehiculo_placa')), col('Tipo', txt('tipo')), col('Estado', txt('estado')), col('Descripción', txt('descripcion')), col('Inicio', fecha('fecha_inicio')), col('Costo', (i) => (i.costo ? `S/ ${s(i.costo)}` : '—'))]} />) },
        { id: 'asientos', label: 'Distribución de asientos', element: (
          <ResourceManager endpoint="/configuraciones-asientos/" singular="distribución" intro="Se genera a partir de filas y asientos por fila. Una vez creada solo se puede renombrar, porque los viajes copian su distribución."
            fields={[{ name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Bus 2 pisos' }, { name: 'pisos', label: 'Pisos', type: 'pisos', createOnly: true }]}
            columns={[col('Nombre', txt('nombre')), col('Pisos', txt('pisos')), col('Asientos', txt('total_asientos'))]} />) },
      ]} />
    </div>
  )
}

// -------------------------------------------------------------- Conductores
const camposConductor: FieldDef[] = [
  { name: 'dni', label: 'DNI', type: 'text', required: true, placeholder: '8 dígitos' },
  { name: 'nombres', label: 'Nombres', type: 'text', required: true },
  { name: 'apellidos', label: 'Apellidos', type: 'text', required: true },
  { name: 'telefono', label: 'Teléfono', type: 'text' },
  { name: 'direccion', label: 'Dirección', type: 'text' },
  { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' },
  { name: 'usuario', label: 'Usuario del sistema', type: 'select', optionsFrom: USUARIOS_CONDUCTOR, help: 'Opcional. Solo usuarios con rol «conductor» (la lista la ve el administrador).' },
]
const CATEGORIAS = ['A-I', 'A-IIa', 'A-IIb', 'A-IIIa', 'A-IIIb', 'A-IIIc'].map((c) => ({ value: c, label: c }))
const camposLicencia: FieldDef[] = [
  { name: 'conductor', label: 'Conductor', type: 'select', required: true, optionsFrom: CONDUCTORES },
  { name: 'numero', label: 'Número de licencia', type: 'text', required: true },
  { name: 'categoria', label: 'Categoría', type: 'select', required: true, options: CATEGORIAS },
  { name: 'fecha_emision', label: 'Emisión', type: 'date', required: true },
  { name: 'fecha_vencimiento', label: 'Vencimiento', type: 'date', required: true },
]
const camposTurno: FieldDef[] = [
  { name: 'conductor', label: 'Conductor', type: 'select', required: true, optionsFrom: CONDUCTORES },
  { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: [{ value: 'TURNO', label: 'Turno' }, { value: 'DESCANSO', label: 'Descanso' }, { value: 'VACACIONES', label: 'Vacaciones' }] },
  { name: 'inicio', label: 'Inicio', type: 'datetime', required: true },
  { name: 'fin', label: 'Fin', type: 'datetime', required: true },
  { name: 'observaciones', label: 'Observaciones', type: 'text' },
]

export function ConductoresPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <Encabezado modulo="Operación y despacho" titulo="Conductores" texto="Conductores, licencias de conducir y turnos, descansos y vacaciones." />
      <Tabs tabs={[
        { id: 'conductores', label: 'Conductores', element: (
          <ResourceManager endpoint="/conductores/" singular="conductor" activeKey="activo" fields={camposConductor}
            columns={[col('Conductor', (i) => `${s(i.apellidos)}, ${s(i.nombres)}`), col('DNI', txt('dni')), col('Teléfono', txt('telefono')), col('Licencia vence', (i) => (i.licencia_vence ? formatDate(i.licencia_vence) : 'Sin licencia activa')), col('Usuario', txt('usuario_username'))]} />) },
        { id: 'licencias', label: 'Licencias', element: (
          <ResourceManager endpoint="/licencias/" singular="licencia" activeKey="activa" fields={camposLicencia}
            columns={[col('Conductor', txt('conductor_nombre')), col('Número', txt('numero')), col('Categoría', txt('categoria')), col('Vence', fecha('fecha_vencimiento'))]} />) },
        { id: 'turnos', label: 'Turnos y descansos', element: (
          <ResourceManager endpoint="/turnos/" singular="turno" searchable={false} fields={camposTurno}
            intro="Un conductor no puede tener dos turnos, descansos o vacaciones que se crucen."
            columns={[col('Conductor', txt('conductor_nombre')), col('Tipo', txt('tipo')), col('Inicio', (i) => formatDateTime(i.inicio)), col('Fin', (i) => formatDateTime(i.fin)), col('Observaciones', txt('observaciones'))]} />) },
      ]} />
    </div>
  )
}

// ------------------------------------------------------------ Configuración
export function ConfiguracionPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado modulo="Seguridad y control" titulo="Configuración general" texto="Parámetros del sistema. Los valores iniciales deben ser confirmados con la empresa." />
      <ResourceManager endpoint="/configuracion/" singular="parámetro" idKey="clave" canCreate={false} searchable={false}
        fields={[{ name: 'valor', label: 'Valor', type: 'text' }]}
        columns={[col('Parámetro', txt('clave')), col('Descripción', txt('descripcion')), col('Valor', (i) => <code className="rounded bg-surface px-1.5 py-0.5">{s(i.valor)}</code>)]} />
    </div>
  )
}
