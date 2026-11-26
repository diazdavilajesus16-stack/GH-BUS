# Manual de usuario — GH BUS

## Alcance y datos

Este manual describe la versión local para presentación académica. El catálogo incluye las localidades y nueve rutas de ida proporcionadas por la usuaria, con precios referenciales y duraciones aproximadas. No se verificaron de forma independiente con GH BUS. Los rangos se guardan como promedio: Tarapoto–Chachapoyas 7 h 30 min, Jaén–Tarapoto 9 h y Lima–Jaén 19 h. La agencia de La Victoria está registrada como referencia de Lima; la dirección exacta está pendiente.

**Yape y Visa son simulaciones:** no se conecta a bancos ni se cobra dinero. El efectivo se registra en la caja de demostración. No ingreses datos personales o financieros reales.

## Perfiles

| Perfil | Funciones principales |
|---|---|
| Administrador | Configura catálogos y usuarios; administra viajes, reservas, caja, liquidaciones, reportes y auditoría. |
| Despachador | Programa viajes, asigna unidades y conductores, gestiona despacho, seguimiento e incidencias; puede validar boletos. |
| Cajero | Consulta viajes, vende y gestiona reservas, abre/cierra su caja y registra movimientos; puede validar boletos. |
| Conductor | Consulta solo sus viajes asignados, registra incidencias y valida boletos de esos viajes. |
| Cliente | Se registra, reserva asientos, consulta sus reservas y muestra sus boletos QR. |

El backend verifica los permisos; ocultar una opción del menú no es el control de seguridad.

## Localidades, rutas y tarifas referenciales

El catálogo contiene estas localidades:

- **San Martín:** Moyobamba, Nueva Cajamarca (provincia de Rioja), Tarapoto, Juanjuí (Mariscal Cáceres), Bellavista, Picota y Tocache.
- **Amazonas:** Chachapoyas, Pedro Ruiz y Pomacochas (Bongará), Rodríguez de Mendoza y Bagua Grande (Utcubamba).
- **Cajamarca:** Jaén y Cajamarca.
- **Lambayeque:** Chiclayo y Lambayeque.
- **La Libertad:** Trujillo y Chepén.
- **Huánuco:** Tingo María (Leoncio Prado).
- **Lima:** Lima, con referencia a una agencia en La Victoria.

Las rutas activas se cargan solo en el sentido indicado:

| Ruta | Duración aproximada guardada | Precio referencial desde |
|---|---:|---:|
| Moyobamba – Tarapoto | 2 h | S/ 32 |
| Tarapoto – Chachapoyas | 7 h 30 min | S/ 40 |
| Chiclayo – Moyobamba | 13 h | S/ 70 |
| Tarapoto – Chiclayo | 16 h | S/ 70 |
| Jaén – Tarapoto | 9 h (promedio de 8–10 h) | S/ 70 |
| Moyobamba – Chiclayo | 15 h 45 min | S/ 80 |
| Lima – Jaén | 19 h (promedio de 17–21 h) | S/ 110 |
| Tarapoto – Trujillo | 20 h | S/ 120 |
| Tarapoto – Lima | 23 h | S/ 150 |

Estos datos fueron proporcionados para el catálogo y no se verificaron de forma independiente. Las tarifas se guardan como monto base desde el cual parte el viaje. No hay horarios de salida cargados.

### Tipos de servicio

| Servicio | Descripción |
|---|---|
| Bus Cama (Cama 180°) | Asientos que se reclinan casi por completo; recomendado para viajes largos. |
| Semi-Cama (Cama 140°) | Reclinación aproximada de 140°; equilibrio entre precio y comodidad. |
| Ejecutivo / Premium | Más espacio entre filas, Wi-Fi, cargadores USB y servicio a bordo. |
| Servicio Estándar / Económico | Servicio regular sin lujos y opción económica para rutas cortas. |
| VIP / Royal | Puede incluir asientos individuales, pantallas personales o cena en rutas muy largas. |

Los precios “desde” de la tabla están asociados únicamente a **Estándar / Económico**. Los otros cuatro servicios aparecen en el catálogo, pero no tienen tarifas cargadas; registra sus precios por ruta antes de programar viajes con ellos. **Comfort Class** quedó inactivo y se conserva solo en el historial.

## Preparar el escenario

1. Inicia GH BUS con las indicaciones del [manual técnico](manual-tecnico.md) y abre `http://localhost:8080`.
2. Ingresa con el administrador creado durante la instalación. No hay contraseñas predeterminadas.
3. Carga las localidades, rutas y tarifas referenciales:

   ```powershell
   docker compose exec backend python manage.py cargar_catalogo_ghbus --forzar
   ```

   El comando carga 20 localidades, nueve rutas en el sentido indicado y los cinco tipos de servicio. Asigna los precios base proporcionados únicamente a Estándar / Económico. No crea horarios porque no se informaron horas de salida; tampoco crea cuentas, conductores ni documentos vehiculares.
4. Si necesitas un bus de ejemplo para la presentación, ejecuta `docker compose exec backend python manage.py cargar_demo --forzar`. Añade `DEMO-001` y una plantilla de 40 asientos, pero no programa salidas.
5. Para poder despachar en el escenario académico, registra un conductor ficticio en **Operación y despacho → Conductores**. Ejemplo: `Conductor Demo`, licencia `DEMO-LIC-001`, categoría `A-IIIb`, con fechas vigentes. En **Vehículos → Documentos**, registra para `DEMO-001` un `SOAT` y una `Revisión técnica` ficticios con vencimiento posterior al viaje. El sistema bloqueará la asignación si falta un documento requerido o está vencido.
6. Si quieres mostrar el acceso del conductor, crea una cuenta con ese rol y relaciónala con el registro del conductor. Para la demostración también puedes operar con el despachador.

## Recorrido de demostración: desde la programación hasta el QR

### 1. Crear un viaje

1. En **Operación y despacho → Horarios**, registra una hora de salida confirmada para la ruta y los días correspondientes. No se cargan horarios automáticamente porque no se proporcionaron.
2. En **Programación de viajes**, genera viajes desde esos horarios para fechas futuras. También puedes crear un **Viaje manual** para una salida confirmada.
3. Actualiza la lista y abre un viaje. Por ejemplo, Moyobamba–Tarapoto tiene duración aproximada de **2 horas** y precio referencial desde **S/ 32.00**. Confirma la tarifa comercial antes de cualquier operación real.
4. En el detalle, asigna `DEMO-001` y el conductor ficticio como **Principal**.
5. Cambia el estado a **Confirmado** y luego **En embarque**. El sistema vuelve a comprobar la licencia, los documentos, el servicio del vehículo y los conflictos de horario.

### 2. Registrar una reserva de cliente

1. Crea una cuenta desde **Registro** e inicia sesión.
2. Abre el viaje y selecciona uno o más asientos disponibles; por ejemplo, el asiento 3.
3. Ingresa los datos ficticios del pasajero y crea la reserva. Los asientos quedan temporalmente retenidos.
4. Elige un método:
   - **Yape o Visa:** completa el pago simulado. No se realiza un cobro real y se emite el QR.
   - **Efectivo:** la reserva queda pendiente. El cliente presenta su referencia al cajero.

El cliente consulta el estado y sus boletos en **Mi cuenta**. Las reservas pendientes vencen según el contador mostrado en pantalla.

### 3. Confirmar efectivo en caja

1. Inicia sesión con un usuario de **Cajero** y abre **Financiero → Caja y movimientos**.
2. Abre la caja con un fondo de ejemplo de **S/ 100.00**.
3. En **Comercial → Reservas**, busca la referencia y registra el efectivo recibido.
4. Comprueba que la reserva se confirme y que el boleto tenga QR. Cerrar caja muestra el saldo esperado y la diferencia frente al monto contado.

No uses dinero real: este movimiento solo sirve para demostrar el flujo.

### 4. Validar embarque y finalizar

1. Abre **Comercial → Control de embarque** desde una cuenta autorizada.
2. Escanea el QR o ingresa su contenido. Solo se valida un boleto pagado; no se puede validar dos veces. Un conductor solo puede validar boletos de viajes que tenga asignados.
3. Desde **Despacho de unidades**, cambia el estado del viaje según el recorrido: **En ruta** y, al terminar, **Finalizado**.
4. Como administrador, abre **Financiero → Liquidación de viajes**, registra gastos ficticios (por ejemplo, combustible **S/ 45.00**) y cierra la liquidación.
5. En **Seguridad y control → Reportes y estadísticas**, revisa el resumen generado con esos datos.

## Reglas y solución de problemas

- **No aparecen viajes:** verifica que existan horario y tarifa vigentes y genera viajes para fechas futuras.
- **No se puede asignar el bus:** revisa que coincidan el tipo de servicio y la capacidad, y que SOAT y revisión técnica estén vigentes.
- **No se puede asignar al conductor:** registra una licencia vigente de categoría permitida (por defecto, A-IIIa, A-IIIb o A-IIIc) y revisa descansos y viajes superpuestos.
- **Un asiento desaparece o queda ocupado:** vuelve a cargar el mapa. El servidor es quien confirma la disponibilidad y bloquea ventas simultáneas.
- **No se puede confirmar efectivo:** el cajero debe abrir su caja antes de confirmar.
- **No aparece el QR:** revisa que el pago se haya confirmado. Una reserva pendiente no emite boleto pagado.
- **El viaje se cancela:** la cancelación anula reservas y boletos asociados y libera los asientos. La versión académica no procesa reembolsos; no representa un proceso de cobro real.
- **Recuperación de contraseña:** sin SMTP configurado, el enlace se imprime en los registros de desarrollo del backend.

## Límites que deben explicarse en clase

La aplicación es un prototipo académico, no un sistema listo para operar una empresa real. No tiene pasarela real de pago, reembolsos automáticos, GPS en vivo ni integración de correo saliente configurada. Aunque el catálogo de rutas y tarifas se cargó con la información proporcionada, sus precios, tiempos y vigencias deben confirmarse con GH BUS antes de usarse comercialmente. El vehículo y demás datos del escenario `cargar_demo` son ilustrativos.
