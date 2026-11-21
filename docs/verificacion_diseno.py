"""Verificación del diseño de docs/database.md contra un MySQL real.

Crea una base TEMPORAL llamada "proto" (la borra y recrea) con las tablas críticas y sus
restricciones, y ataca los mecanismos con decenas de conexiones simultáneas:
CHECK, unicidad de asientos y QR, bloqueo de asientos, expiración, embarque y solapamientos.
NO toca la base "ghbus".

Uso contra el MySQL de Docker Compose (puerto 3306 publicado en 127.0.0.1):
    MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=<MYSQL_ROOT_PASSWORD de tu .env> \
        python docs/verificacion_diseno.py
Requiere: pip install mysqlclient  (ya está en backend/requirements.txt)
Sin variables, usa el socket local de MySQL como root.
"""
import os
import random
import threading
import time
import MySQLdb

SOCK = "/var/run/mysqld/mysqld.sock"
resultados = []


def _parametros():
    if os.environ.get("MYSQL_HOST"):
        return dict(host=os.environ["MYSQL_HOST"], port=int(os.environ.get("MYSQL_PORT", "3306")),
                    user=os.environ.get("MYSQL_USER", "root"), passwd=os.environ.get("MYSQL_PASSWORD", ""))
    return dict(user="root", unix_socket=SOCK)


def conectar(db="proto"):
    c = MySQLdb.connect(db=db, charset="utf8mb4", **_parametros())
    c.autocommit(False)
    cur = c.cursor()
    cur.execute("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED")
    c.commit()
    return c


def check(nombre, ok, detalle=""):
    resultados.append(ok)
    print(("PASA  " if ok else "FALLA ") + nombre + (f"  [{detalle}]" if detalle else ""))


def code(e):
    return e.args[0] if e.args else None


# ---------------------------------------------------------------- esquema
root = MySQLdb.connect(charset="utf8mb4", **_parametros())
rc = root.cursor()
rc.execute("DROP DATABASE IF EXISTS proto")
rc.execute("CREATE DATABASE proto CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
rc.execute("USE proto")
DDL = [
    "CREATE TABLE vehiculo (id BIGINT AUTO_INCREMENT PRIMARY KEY, placa VARCHAR(10) UNIQUE) ENGINE=InnoDB",
    """CREATE TABLE viaje (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, vehiculo_id BIGINT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'PROGRAMADO',
        salida_programada DATETIME(6) NOT NULL, llegada_programada DATETIME(6) NOT NULL,
        salida_real DATETIME(6) NULL, llegada_real DATETIME(6) NULL,
        CONSTRAINT fk_v_veh FOREIGN KEY (vehiculo_id) REFERENCES vehiculo(id),
        CONSTRAINT ck_v1 CHECK (llegada_programada > salida_programada),
        CONSTRAINT ck_v2 CHECK (llegada_real IS NULL OR salida_real IS NOT NULL),
        CONSTRAINT ck_v3 CHECK (estado NOT IN ('EN_EMBARQUE','EN_RUTA') OR vehiculo_id IS NOT NULL),
        KEY ix_v (vehiculo_id, salida_programada, llegada_programada)) ENGINE=InnoDB""",
    """CREATE TABLE reserva (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, viaje_id BIGINT NOT NULL,
        estado VARCHAR(12) NOT NULL, expira_en DATETIME(6) NULL,
        CONSTRAINT fk_r_v FOREIGN KEY (viaje_id) REFERENCES viaje(id),
        CONSTRAINT ck_r1 CHECK (estado <> 'PENDIENTE' OR expira_en IS NOT NULL)) ENGINE=InnoDB""",
    """CREATE TABLE asiento_viaje (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, viaje_id BIGINT NOT NULL, numero SMALLINT NOT NULL,
        estado VARCHAR(14) NOT NULL DEFAULT 'LIBRE', reserva_id BIGINT NULL, bloqueado_hasta DATETIME(6) NULL,
        CONSTRAINT fk_a_v FOREIGN KEY (viaje_id) REFERENCES viaje(id),
        CONSTRAINT fk_a_r FOREIGN KEY (reserva_id) REFERENCES reserva(id),
        UNIQUE KEY uq_a (viaje_id, numero),
        KEY ix_a1 (viaje_id, estado), KEY ix_a2 (estado, bloqueado_hasta),
        CONSTRAINT ck_a CHECK (
            (estado IN ('LIBRE','INHABILITADO') AND reserva_id IS NULL AND bloqueado_hasta IS NULL)
         OR (estado = 'BLOQUEADO' AND reserva_id IS NOT NULL AND bloqueado_hasta IS NOT NULL)
         OR (estado = 'VENDIDO' AND reserva_id IS NOT NULL AND bloqueado_hasta IS NULL))) ENGINE=InnoDB""",
    """CREATE TABLE boleto (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, reserva_id BIGINT NOT NULL, viaje_id BIGINT NOT NULL,
        asiento_viaje_id BIGINT NOT NULL, pasajero_id BIGINT NULL,
        estado VARCHAR(12) NOT NULL, codigo_qr CHAR(43) NULL, vigente TINYINT(1) NULL,
        abordado_en DATETIME(6) NULL,
        CONSTRAINT fk_b_r FOREIGN KEY (reserva_id) REFERENCES reserva(id),
        CONSTRAINT fk_b_v FOREIGN KEY (viaje_id) REFERENCES viaje(id),
        CONSTRAINT fk_b_a FOREIGN KEY (asiento_viaje_id) REFERENCES asiento_viaje(id),
        UNIQUE KEY uq_qr (codigo_qr),
        UNIQUE KEY uq_vig (asiento_viaje_id, vigente),
        CONSTRAINT ck_b1 CHECK (
            (estado IN ('RESERVADO','EMITIDO','ABORDADO') AND vigente = 1)
         OR (estado IN ('ANULADO','REEMBOLSADO','EXPIRADO') AND vigente IS NULL)),
        CONSTRAINT ck_b2 CHECK (estado NOT IN ('EMITIDO','ABORDADO') OR (codigo_qr IS NOT NULL AND pasajero_id IS NOT NULL)),
        CONSTRAINT ck_b3 CHECK (estado <> 'ABORDADO' OR abordado_en IS NOT NULL)) ENGINE=InnoDB""",
    """CREATE TABLE caja (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, responsable_id BIGINT NOT NULL, estado VARCHAR(8) NOT NULL,
        abierta_vigente TINYINT(1) NULL, cierre_en DATETIME NULL,
        UNIQUE KEY uq_caja (responsable_id, abierta_vigente),
        CONSTRAINT ck_c CHECK ((estado='ABIERTA' AND abierta_vigente=1)
            OR (estado='CERRADA' AND abierta_vigente IS NULL AND cierre_en IS NOT NULL))) ENGINE=InnoDB""",
    """CREATE TABLE gasto (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, viaje_id BIGINT NULL, mantenimiento_id BIGINT NULL,
        monto DECIMAL(12,2) NOT NULL,
        CONSTRAINT ck_g1 CHECK (viaje_id IS NOT NULL OR mantenimiento_id IS NOT NULL),
        CONSTRAINT ck_g2 CHECK (monto > 0)) ENGINE=InnoDB""",
    """CREATE TABLE movimiento_financiero (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, caja_id BIGINT NULL, tipo VARCHAR(8) NOT NULL,
        canal VARCHAR(10) NOT NULL, monto DECIMAL(12,2) NOT NULL,
        pago_id BIGINT NULL, gasto_id BIGINT NULL, reembolso_id BIGINT NULL, viaje_id BIGINT NULL,
        CONSTRAINT ck_m1 CHECK (monto > 0),
        CONSTRAINT ck_m2 CHECK ((tipo='INGRESO' AND pago_id IS NOT NULL)
            OR (tipo='EGRESO' AND (gasto_id IS NOT NULL OR reembolso_id IS NOT NULL))),
        CONSTRAINT ck_m3 CHECK (canal='ONLINE' OR caja_id IS NOT NULL),
        CONSTRAINT ck_m4 CHECK (tipo='EGRESO' OR viaje_id IS NOT NULL)) ENGINE=InnoDB""",
]
for s in DDL:
    rc.execute(s)
root.commit()
rc.execute("SELECT VERSION()"); print("MySQL", rc.fetchone()[0])
print("Esquema del prototipo creado: %d tablas con sus CHECK / UNIQUE / FK\n" % len(DDL))

db = conectar()
cur = db.cursor()


def sql(q, a=()):
    cur.execute(q, a)
    db.commit()
    return cur


def intenta(q, a=()):
    try:
        cur.execute(q, a)
        db.commit()
        return None
    except MySQLdb.Error as e:
        db.rollback()
        return code(e)


T0 = "2026-12-01 08:00:00"
T1 = "2026-12-01 20:00:00"

# ------------------------------------------------ T1: restricciones CHECK
print("== T1. Las restricciones CHECK rechazan datos inconsistentes (error 3819)")
sql("INSERT INTO vehiculo (placa) VALUES ('V-000')")
sql("INSERT INTO viaje (salida_programada, llegada_programada) VALUES (%s,%s)", (T0, T1))
v0 = cur.lastrowid
sql("INSERT INTO reserva (viaje_id, estado, expira_en) VALUES (%s,'CONFIRMADA',NULL)", (v0,))
r0 = cur.lastrowid
check("viaje EN_RUTA sin vehículo", intenta("INSERT INTO viaje (estado,salida_programada,llegada_programada) VALUES ('EN_RUTA',%s,%s)", (T0, T1)) == 3819)
check("viaje que llega antes de salir", intenta("INSERT INTO viaje (salida_programada,llegada_programada) VALUES (%s,%s)", (T1, T0)) == 3819)
check("reserva PENDIENTE sin vencimiento", intenta("INSERT INTO reserva (viaje_id,estado) VALUES (%s,'PENDIENTE')", (v0,)) == 3819)
check("asiento LIBRE con reserva", intenta("INSERT INTO asiento_viaje (viaje_id,numero,estado,reserva_id) VALUES (%s,900,'LIBRE',%s)", (v0, r0)) == 3819)
check("asiento BLOQUEADO sin vencimiento", intenta("INSERT INTO asiento_viaje (viaje_id,numero,estado,reserva_id) VALUES (%s,901,'BLOQUEADO',%s)", (v0, r0)) == 3819)
sql("INSERT INTO asiento_viaje (viaje_id,numero) VALUES (%s,902)", (v0,))
a902 = cur.lastrowid
check("boleto EMITIDO sin QR", intenta("INSERT INTO boleto (reserva_id,viaje_id,asiento_viaje_id,pasajero_id,estado,vigente) VALUES (%s,%s,%s,1,'EMITIDO',1)", (r0, v0, a902)) == 3819)
check("boleto ANULADO marcado vigente", intenta("INSERT INTO boleto (reserva_id,viaje_id,asiento_viaje_id,estado,vigente) VALUES (%s,%s,%s,'ANULADO',1)", (r0, v0, a902)) == 3819)
check("boleto ABORDADO sin hora de abordaje", intenta("INSERT INTO boleto (reserva_id,viaje_id,asiento_viaje_id,pasajero_id,estado,codigo_qr,vigente) VALUES (%s,%s,%s,1,'ABORDADO','qr-x',1)", (r0, v0, a902)) == 3819)
check("gasto sin viaje ni mantenimiento (regla 9)", intenta("INSERT INTO gasto (monto) VALUES (10)") == 3819)
check("movimiento INGRESO sin pago (regla 9)", intenta("INSERT INTO movimiento_financiero (caja_id,tipo,canal,monto,viaje_id) VALUES (1,'INGRESO','PRESENCIAL',10,%s)", (v0,)) == 3819)
check("movimiento presencial sin caja", intenta("INSERT INTO movimiento_financiero (tipo,canal,monto,pago_id,viaje_id) VALUES ('INGRESO','PRESENCIAL',10,1,%s)", (v0,)) == 3819)
check("movimiento INGRESO online válido (sin caja)", intenta("INSERT INTO movimiento_financiero (tipo,canal,monto,pago_id,viaje_id) VALUES ('INGRESO','ONLINE',10,1,%s)", (v0,)) is None)

# ------------------------------------------ T2: unicidad con el truco 'vigente'
print("\n== T2. Un asiento no admite dos boletos vigentes; los anulados se conservan")
ins = "INSERT INTO boleto (reserva_id,viaje_id,asiento_viaje_id,estado,vigente) VALUES (%s,%s,%s,%s,%s)"
check("primer boleto RESERVADO vigente", intenta(ins, (r0, v0, a902, "RESERVADO", 1)) is None)
check("segundo boleto vigente en el mismo asiento", intenta(ins, (r0, v0, a902, "RESERVADO", 1)) == 1062)
sql("UPDATE boleto SET estado='ANULADO', vigente=NULL WHERE asiento_viaje_id=%s", (a902,))
check("tras anular, el asiento admite otro boleto", intenta(ins, (r0, v0, a902, "RESERVADO", 1)) is None)
check("se pueden acumular varios boletos anulados", intenta(ins, (r0, v0, a902, "ANULADO", None)) is None and intenta(ins, (r0, v0, a902, "EXPIRADO", None)) is None)
cur.execute("SELECT COUNT(*) FROM boleto WHERE asiento_viaje_id=%s", (a902,)); n = cur.fetchone()[0]
check("historial conservado (4 filas, 1 vigente)", n == 4, f"{n} filas")

# ------------------------------------------- T3: concurrencia de reservas
N_ASIENTOS = 12
sql("INSERT INTO viaje (salida_programada, llegada_programada) VALUES (%s,%s)", (T0, T1))
vc = cur.lastrowid
for n in range(1, N_ASIENTOS + 1):
    cur.execute("INSERT INTO asiento_viaje (viaje_id,numero) VALUES (%s,%s)", (vc, n))
db.commit()
contadores = {"deadlock": 0, "timeout": 0, "otro": 0}
lock_cnt = threading.Lock()


def reservar(conn, viaje_id, numeros, expirar_antes=True):
    """Algoritmo 6.1 de docs/database.md. Devuelve 'OK', 'CONFLICTO' o 'ERROR-<codigo>'."""
    c = conn.cursor()
    try:
        c.execute("START TRANSACTION")
        ph = ",".join(["%s"] * len(numeros))
        c.execute(f"""SELECT id, estado, reserva_id, (bloqueado_hasta IS NOT NULL AND bloqueado_hasta <= NOW(6)) AS vencido
                        FROM asiento_viaje WHERE viaje_id=%s AND numero IN ({ph}) ORDER BY numero FOR UPDATE""",
                  (viaje_id, *sorted(numeros)))
        filas = c.fetchall()
        libres = []
        for aid, estado, rid, vencido in filas:
            if estado == "BLOQUEADO" and vencido:
                if expirar_antes:
                    c.execute("UPDATE boleto SET estado='EXPIRADO', vigente=NULL WHERE asiento_viaje_id=%s AND vigente=1", (aid,))
                c.execute("UPDATE reserva SET estado='EXPIRADA' WHERE id=%s", (rid,))
                c.execute("UPDATE asiento_viaje SET estado='LIBRE', reserva_id=NULL, bloqueado_hasta=NULL WHERE id=%s", (aid,))
                libres.append(aid)
            elif estado == "LIBRE":
                libres.append(aid)
            else:
                conn.rollback()
                return "CONFLICTO"
        c.execute("INSERT INTO reserva (viaje_id, estado, expira_en) VALUES (%s,'PENDIENTE', DATE_ADD(NOW(6), INTERVAL 600 SECOND))", (viaje_id,))
        rid = c.lastrowid
        for aid in libres:
            c.execute("UPDATE asiento_viaje SET estado='BLOQUEADO', reserva_id=%s, bloqueado_hasta=DATE_ADD(NOW(6), INTERVAL 600 SECOND) WHERE id=%s", (rid, aid))
            c.execute("INSERT INTO boleto (reserva_id,viaje_id,asiento_viaje_id,estado,vigente) VALUES (%s,%s,%s,'RESERVADO',1)", (rid, viaje_id, aid))
        conn.commit()
        return "OK"
    except MySQLdb.Error as e:
        conn.rollback()
        k = code(e)
        with lock_cnt:
            contadores["deadlock" if k == 1213 else "timeout" if k == 1205 else "otro"] += 1
        return f"ERROR-{k}"


def correr(n_hilos, tarea):
    barrera = threading.Barrier(n_hilos)
    salida = [None] * n_hilos

    def run(i):
        conn = conectar()
        barrera.wait()
        try:
            salida[i] = tarea(i, conn)
        finally:
            conn.close()

    hs = [threading.Thread(target=run, args=(i,)) for i in range(n_hilos)]
    [h.start() for h in hs]
    [h.join() for h in hs]
    return salida


print("\n== T3. Concurrencia al reservar asientos (algoritmo 6.1)")
# 3a: 40 compradores quieren exactamente el MISMO asiento
sal = correr(40, lambda i, c: reservar(c, vc, [1]))
check("40 compradores simultáneos por el asiento 1: gana exactamente 1", sal.count("OK") == 1, f"{sal.count('OK')} ganó, {sal.count('CONFLICTO')} rechazados")

# 3b: 60 compradores piden 3 asientos al azar entre los 11 restantes
cur.execute("SELECT COALESCE(MAX(id),0) FROM reserva"); ultima_reserva_3a = cur.fetchone()[0]; db.commit()
random.seed(7)
pedidos = [random.sample(range(2, N_ASIENTOS + 1), 3) for _ in range(60)]
sal = correr(60, lambda i, c: reservar(c, vc, pedidos[i]))
ok = sal.count("OK")
cur.execute("SELECT COUNT(*) FROM asiento_viaje WHERE viaje_id=%s AND estado='BLOQUEADO'", (vc,)); bloq = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM boleto WHERE viaje_id=%s AND vigente=1", (vc,)); vig = cur.fetchone()[0]
cur.execute("""SELECT COUNT(*) FROM asiento_viaje a WHERE a.viaje_id=%s AND a.estado='BLOQUEADO'
               AND (SELECT COUNT(*) FROM boleto b WHERE b.asiento_viaje_id=a.id AND b.vigente=1 AND b.reserva_id=a.reserva_id)<>1""", (vc,)); incons = cur.fetchone()[0]
cur.execute("""SELECT COUNT(*) FROM reserva r WHERE r.viaje_id=%s AND r.estado='PENDIENTE' AND r.id > %s
               AND (SELECT COUNT(*) FROM boleto b WHERE b.reserva_id=r.id AND b.vigente=1)<>3""", (vc, ultima_reserva_3a)); parciales = cur.fetchone()[0]
check("ninguna reserva quedó a medias (todo o nada)", parciales == 0)
check("cada asiento bloqueado tiene exactamente 1 boleto vigente de SU reserva", incons == 0)
check("asientos bloqueados = boletos vigentes (incluye el asiento 1)", bloq == vig and bloq == 3 * (ok) + 1, f"{ok} reservas ganadoras × 3 + 1 = {bloq} asientos, {vig} boletos")
check("sin interbloqueos (deadlocks) gracias al orden fijo", contadores["deadlock"] == 0, f"deadlocks={contadores['deadlock']}, timeouts={contadores['timeout']}, otros={contadores['otro']}")

# ------------------------------------ T4: reserva abandonada y su expiración
print("\n== T4. Reserva abandonada: el asiento vuelve a venderse")
sql("INSERT INTO viaje (salida_programada, llegada_programada) VALUES (%s,%s)", (T0, T1)); vx = cur.lastrowid
sql("INSERT INTO asiento_viaje (viaje_id,numero) VALUES (%s,5)", (vx,)); ax = cur.lastrowid


def abandonar(viaje, asiento):
    cur.execute("INSERT INTO reserva (viaje_id,estado,expira_en) VALUES (%s,'PENDIENTE', DATE_SUB(NOW(6), INTERVAL 1 MINUTE))", (viaje,)); r = cur.lastrowid
    cur.execute("UPDATE asiento_viaje SET estado='BLOQUEADO', reserva_id=%s, bloqueado_hasta=DATE_SUB(NOW(6), INTERVAL 1 MINUTE) WHERE id=%s", (r, asiento))
    cur.execute("INSERT INTO boleto (reserva_id,viaje_id,asiento_viaje_id,estado,vigente) VALUES (%s,%s,%s,'RESERVADO',1)", (r, viaje, asiento))
    db.commit()
    return r


abandonar(vx, ax)
cx = conectar()
check("control negativo: tomar el asiento SIN expirar el boleto viejo choca con el UNIQUE", reservar(cx, vx, [5], expirar_antes=False) == "ERROR-1062")
cur.execute("SELECT estado, reserva_id FROM asiento_viaje WHERE id=%s", (ax,)); estado_tras_error = cur.fetchone()[0]
db.commit()
check("…y la transacción se revierte sin dejar basura", estado_tras_error == "BLOQUEADO")
check("con el paso 3 del algoritmo (expirar primero), la nueva reserva funciona", reservar(cx, vx, [5], expirar_antes=True) == "OK")
cur.execute("SELECT SUM(estado='EXPIRADO'), SUM(estado='RESERVADO' AND vigente=1) FROM boleto WHERE asiento_viaje_id=%s", (ax,)); exp, vivo = cur.fetchone(); db.commit()
check("boleto viejo EXPIRADO y 1 boleto nuevo vigente", (exp, vivo) == (1, 1), f"expirados={exp}, vigentes={vivo}")
cx.close()

# ------------------------------------------------ T5: QR de un solo uso
print("\n== T5. Boleto con QR: un solo embarque (algoritmo 6.3)")
sql("INSERT INTO viaje (salida_programada, llegada_programada) VALUES (%s,%s)", (T0, T1)); vq = cur.lastrowid
sql("INSERT INTO asiento_viaje (viaje_id,numero) VALUES (%s,1)", (vq,)); aq = cur.lastrowid
sql("INSERT INTO reserva (viaje_id,estado) VALUES (%s,'CONFIRMADA')", (vq,)); rq = cur.lastrowid
sql("UPDATE asiento_viaje SET estado='VENDIDO', reserva_id=%s WHERE id=%s", (rq, aq))
QR = "Zx" * 21 + "k"
sql("INSERT INTO boleto (reserva_id,viaje_id,asiento_viaje_id,pasajero_id,estado,codigo_qr,vigente) VALUES (%s,%s,%s,1,'EMITIDO',%s,1)", (rq, vq, aq, QR))
check("el mismo QR no puede repetirse en otro boleto", intenta("INSERT INTO boleto (reserva_id,viaje_id,asiento_viaje_id,pasajero_id,estado,codigo_qr,vigente) VALUES (%s,%s,%s,1,'EMITIDO',%s,NULL)", (rq, vq, aq, QR)) in (1062, 3819))


def escanear(i, conn):
    c = conn.cursor()
    c.execute("UPDATE boleto SET estado='ABORDADO', abordado_en=NOW(6) WHERE codigo_qr=%s AND viaje_id=%s AND estado='EMITIDO'", (QR, vq))
    n = c.rowcount
    conn.commit()
    return n


sal = correr(40, escanear)
check("40 lectores escanean el mismo QR a la vez: solo 1 lo valida", sum(sal) == 1, f"filas afectadas: {sum(sal)}")
cur.execute("SELECT estado FROM boleto WHERE codigo_qr=%s", (QR,)); e = cur.fetchone()[0]; db.commit()
check("un reintento posterior tampoco lo valida", escanear(0, db) == 0 and e == "ABORDADO")

# ----------------------------- T6: solapamiento de vehículo (regla 1)
print("\n== T6. Un vehículo no puede estar en dos viajes a la vez (algoritmo 6.4)")
sql("INSERT INTO vehiculo (placa) VALUES ('BUS-001')"); veh = cur.lastrowid
ids = []
for _ in range(30):
    cur.execute("INSERT INTO viaje (salida_programada, llegada_programada) VALUES (%s,%s)", (T0, T1)); ids.append(cur.lastrowid)
db.commit()


def asignar(conn, viaje_id, con_bloqueo):
    c = conn.cursor()
    c.execute("START TRANSACTION")
    if con_bloqueo:
        c.execute("SELECT id FROM vehiculo WHERE id=%s FOR UPDATE", (veh,))
    c.execute("""SELECT COUNT(*) FROM viaje WHERE vehiculo_id=%s AND id<>%s AND estado NOT IN ('CANCELADO','FINALIZADO')
                 AND salida_programada < DATE_ADD(%s, INTERVAL 60 MINUTE) AND DATE_ADD(llegada_programada, INTERVAL 60 MINUTE) > %s""",
              (veh, viaje_id, T1, T0))
    if c.fetchone()[0] > 0:
        conn.rollback()
        return "CONFLICTO"
    time.sleep(0.03)  # ventana entre verificar y guardar, como en una petición real
    c.execute("UPDATE viaje SET vehiculo_id=%s WHERE id=%s", (veh, viaje_id))
    conn.commit()
    return "OK"


sal = correr(30, lambda i, c: asignar(c, ids[i], True))
check("con bloqueo de la fila del vehículo: 30 intentos simultáneos, gana exactamente 1", sal.count("OK") == 1, f"{sal.count('OK')} asignado(s)")
sql("UPDATE viaje SET vehiculo_id=NULL WHERE vehiculo_id=%s", (veh,))
sal = correr(30, lambda i, c: asignar(c, ids[i], False))
check("control negativo: SIN el bloqueo, MySQL deja asignar el bus a varios viajes (por eso el servicio lo bloquea)", sal.count("OK") > 1, f"{sal.count('OK')} asignados a la vez")

# ------------------------------------------------- T7: caja única abierta
print("\n== T7. Un cajero no puede tener dos cajas abiertas")
check("primera caja abierta", intenta("INSERT INTO caja (responsable_id,estado,abierta_vigente) VALUES (7,'ABIERTA',1)") is None)
check("segunda caja abierta del mismo cajero", intenta("INSERT INTO caja (responsable_id,estado,abierta_vigente) VALUES (7,'ABIERTA',1)") == 1062)
check("otro cajero sí puede abrir la suya", intenta("INSERT INTO caja (responsable_id,estado,abierta_vigente) VALUES (8,'ABIERTA',1)") is None)
sql("UPDATE caja SET estado='CERRADA', abierta_vigente=NULL, cierre_en=NOW() WHERE responsable_id=7")
check("tras cerrar, puede abrir otra", intenta("INSERT INTO caja (responsable_id,estado,abierta_vigente) VALUES (7,'ABIERTA',1)") is None)

print("\n==== RESUMEN: %d/%d comprobaciones pasan ====" % (sum(resultados), len(resultados)))
