"""Roles del sistema. Se guardan como grupos de Django (auth_group) y se crean en la migración 0002."""

ADMINISTRADOR = "administrador"
DESPACHADOR = "despachador"
CAJERO = "cajero"
CONDUCTOR = "conductor"
CLIENTE = "cliente"

TODOS = (ADMINISTRADOR, DESPACHADOR, CAJERO, CONDUCTOR, CLIENTE)
PERSONAL = (ADMINISTRADOR, DESPACHADOR, CAJERO, CONDUCTOR)

DESCRIPCIONES = {
    ADMINISTRADOR: "Acceso general: usuarios, permisos, rutas, tarifas, horarios, reportes y finanzas.",
    DESPACHADOR: "Asigna vehículos y conductores, registra salidas y llegadas, embarques e incidencias.",
    CAJERO: "Vende boletos en taquilla, gestiona reservas y pagos, y consulta sus movimientos de caja.",
    CONDUCTOR: "Consulta sus viajes asignados, su vehículo y registra incidencias.",
    CLIENTE: "Crea su cuenta, reserva asientos, compra boletos y descarga sus boletos.",
}
