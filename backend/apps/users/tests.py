import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import RegistroAuditoria

from .roles import ADMINISTRADOR, CAJERO, CLIENTE, CONDUCTOR, DESPACHADOR, TODOS

User = get_user_model()
CLAVE = "Clave-Segura-2026!"
COOKIE = settings.AUTH_COOKIE_NAME


def crear(username, rol=None, **extra):
    user = User.objects.create_user(username=username, email=f"{username}@ejemplo.pe", password=CLAVE, **extra)
    if rol:
        user.groups.add(Group.objects.get(name=rol))
    return user


class BaseTest(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def login(self, username, password=CLAVE, client=None):
        return (client or self.client).post("/api/auth/login/", {"username": username, "password": password}, format="json")

    def autenticar(self, username):
        r = self.login(username)
        self.assertEqual(r.status_code, 200, r.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        return r


class RolesTests(TestCase):
    def test_roles_iniciales_existen(self):
        self.assertEqual(set(Group.objects.values_list("name", flat=True)), set(TODOS))


class LoginTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.user = crear("maria", CAJERO, first_name="María")

    def test_login_ok_devuelve_access_roles_y_cookie_httponly(self):
        r = self.login("maria")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("refresh", r.data)
        self.assertEqual(r.data["user"]["roles"], [CAJERO])
        self.assertEqual(AccessToken(r.data["access"])["roles"], [CAJERO])
        c = r.cookies[COOKIE]
        self.assertTrue(c["httponly"])
        self.assertEqual(c["samesite"], "Strict")
        self.assertEqual(c["path"], "/api/auth/")

    def test_login_con_correo_y_mayusculas(self):
        self.assertEqual(self.login("MARIA@ejemplo.pe").status_code, 200)

    def test_credenciales_malas_mismo_mensaje(self):
        a = self.login("maria", "mala")
        b = self.login("noexiste", "mala")
        self.assertEqual(a.status_code, 401)
        self.assertEqual(a.data, b.data)

    def test_usuario_inactivo_no_entra(self):
        self.user.is_active = False
        self.user.save()
        r = self.login("maria")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.data["detail"], self.login("noexiste", "x").data["detail"])

    def test_bloqueo_tras_intentos_fallidos(self):
        for _ in range(settings.LOGIN_MAX_FAILURES):
            self.assertEqual(self.login("maria", "mala").status_code, 401)
        self.assertEqual(self.login("maria", CLAVE).status_code, 429)  # ni con la clave correcta

    def test_bloqueo_no_afecta_a_otra_cuenta(self):
        crear("otro", CAJERO)
        for _ in range(settings.LOGIN_MAX_FAILURES):
            self.login("maria", "mala")
        self.assertEqual(self.login("otro").status_code, 200)

    def test_login_ok_limpia_fallos(self):
        for _ in range(settings.LOGIN_MAX_FAILURES - 1):
            self.login("maria", "mala")
        self.assertEqual(self.login("maria").status_code, 200)
        for _ in range(settings.LOGIN_MAX_FAILURES - 1):
            self.login("maria", "mala")
        self.assertEqual(self.login("maria").status_code, 200)

    def test_login_se_audita_sin_guardar_la_clave(self):
        self.login("maria", "secreto-equivocado")
        self.login("maria")
        acciones = list(RegistroAuditoria.objects.values_list("accion", flat=True))
        self.assertIn("LOGIN_FALLIDO", acciones)
        self.assertIn("LOGIN", acciones)
        self.assertNotIn("secreto-equivocado", str(list(RegistroAuditoria.objects.values())))

    def test_me_requiere_token(self):
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        self.autenticar("maria")
        self.assertEqual(self.client.get("/api/auth/me/").data["username"], "maria")


class RefreshTests(BaseTest):
    def setUp(self):
        super().setUp()
        crear("maria", CAJERO)

    def test_refresh_rota_y_es_de_un_solo_uso(self):
        self.login("maria")
        antiguo = self.client.cookies[COOKIE].value
        r = self.client.post("/api/auth/refresh/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("access", r.data)
        nuevo = r.cookies[COOKIE].value
        self.assertNotEqual(antiguo, nuevo)
        # reutilizar el refresh antiguo falla
        otro = APIClient()
        otro.cookies[COOKIE] = antiguo
        self.assertEqual(otro.post("/api/auth/refresh/").status_code, 401)

    def test_refresh_sin_cookie(self):
        self.assertEqual(APIClient().post("/api/auth/refresh/").status_code, 401)

    def test_refresh_basura(self):
        c = APIClient()
        c.cookies[COOKIE] = "no.es.un.token"
        self.assertEqual(c.post("/api/auth/refresh/").status_code, 401)

    def test_logout_invalida_refresh(self):
        self.login("maria")
        valor = self.client.cookies[COOKIE].value
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 204)
        c = APIClient()
        c.cookies[COOKIE] = valor
        self.assertEqual(c.post("/api/auth/refresh/").status_code, 401)
        self.assertTrue(RegistroAuditoria.objects.filter(accion="LOGOUT").exists())

    def test_logout_sin_sesion_no_falla(self):
        self.assertEqual(APIClient().post("/api/auth/logout/").status_code, 204)

    def test_refresh_de_usuario_desactivado_falla(self):
        self.login("maria")
        User.objects.filter(username="maria").update(is_active=False)
        self.assertEqual(self.client.post("/api/auth/refresh/").status_code, 401)

    def test_refresh_refleja_cambio_de_roles(self):
        self.login("maria")
        u = User.objects.get(username="maria")
        u.groups.set(Group.objects.filter(name=DESPACHADOR))
        r = self.client.post("/api/auth/refresh/")
        self.assertEqual(AccessToken(r.data["access"])["roles"], [DESPACHADOR])


class RegistroTests(BaseTest):
    datos = {"username": "Nuevo", "email": "Nuevo@Ejemplo.pe", "password": CLAVE,
             "first_name": "Nu", "last_name": "Evo", "telefono": "+51 999 888 777"}

    def test_registro_crea_cliente_en_minusculas(self):
        r = self.client.post("/api/auth/register/", self.datos, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        u = User.objects.get(username="nuevo")
        self.assertEqual(u.email, "nuevo@ejemplo.pe")
        self.assertEqual(u.role_names(), [CLIENTE])
        self.assertIn(COOKIE, r.cookies)

    def test_registro_no_permite_elegir_rol_ni_privilegios(self):
        d = {**self.datos, "roles": [ADMINISTRADOR], "is_superuser": True, "is_staff": True}
        self.assertEqual(self.client.post("/api/auth/register/", d, format="json").status_code, 201)
        u = User.objects.get(username="nuevo")
        self.assertEqual(u.role_names(), [CLIENTE])
        self.assertFalse(u.is_superuser or u.is_staff)

    def test_duplicados_sin_distinguir_mayusculas(self):
        crear("nuevo", CLIENTE)
        r = self.client.post("/api/auth/register/", self.datos, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("username", r.data)
        r = self.client.post("/api/auth/register/", {**self.datos, "username": "otro", "email": "NUEVO@ejemplo.pe"},
                             format="json")
        self.assertIn("email", r.data)

    def test_clave_debil_rechazada(self):
        for clave in ("12345678", "corta1A", "nuevo123"):
            r = self.client.post("/api/auth/register/", {**self.datos, "password": clave}, format="json")
            self.assertEqual(r.status_code, 400, clave)

    def test_telefono_y_usuario_invalidos(self):
        self.assertEqual(self.client.post("/api/auth/register/", {**self.datos, "telefono": "abc"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/auth/register/", {**self.datos, "username": "a b"}, format="json").status_code, 400)


class PerfilYClaveTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.user = crear("maria", CAJERO)

    def test_editar_perfil_no_permite_cambiar_roles(self):
        self.autenticar("maria")
        r = self.client.patch("/api/auth/me/", {"first_name": "Ana", "roles": [ADMINISTRADOR], "is_superuser": True},
                              format="json")
        self.assertEqual(r.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Ana")
        self.assertEqual(self.user.role_names(), [CAJERO])
        self.assertFalse(self.user.is_superuser)

    def test_correo_duplicado_en_perfil(self):
        crear("otro", CAJERO)
        self.autenticar("maria")
        self.assertEqual(self.client.patch("/api/auth/me/", {"email": "OTRO@ejemplo.pe"}, format="json").status_code, 400)

    def test_cambiar_clave_revoca_sesiones(self):
        self.autenticar("maria")
        valor = self.client.cookies[COOKIE].value
        r = self.client.post("/api/auth/password/change/",
                             {"current_password": CLAVE, "new_password": "Otra-Clave-2027!"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        c = APIClient()
        c.cookies[COOKIE] = valor
        self.assertEqual(c.post("/api/auth/refresh/").status_code, 401)
        self.assertEqual(self.login("maria", CLAVE).status_code, 401)
        self.assertEqual(self.login("maria", "Otra-Clave-2027!").status_code, 200)

    def test_cambiar_clave_exige_actual_y_fuerte(self):
        self.autenticar("maria")
        r = self.client.post("/api/auth/password/change/", {"current_password": "mala", "new_password": "Otra-Clave-2027!"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/auth/password/change/", {"current_password": CLAVE, "new_password": "12345678"}, format="json")
        self.assertEqual(r.status_code, 400)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", FRONTEND_URL="http://app.test")
class RecuperacionTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.user = crear("maria", CAJERO)

    def _enlace(self):
        self.client.post("/api/auth/password/reset/", {"email": "maria@ejemplo.pe"}, format="json")
        m = re.search(r"uid=([^&\s]+)&token=([^\s]+)", mail.outbox[-1].body)
        return m.group(1), m.group(2)

    def test_respuesta_identica_exista_o_no(self):
        a = self.client.post("/api/auth/password/reset/", {"email": "maria@ejemplo.pe"}, format="json")
        n = len(mail.outbox)
        b = self.client.post("/api/auth/password/reset/", {"email": "nadie@ejemplo.pe"}, format="json")
        self.assertEqual((a.status_code, a.data), (b.status_code, b.data))
        self.assertEqual(a.status_code, 202)
        self.assertEqual(len(mail.outbox), n)  # no se envió correo al inexistente
        self.assertEqual(n, 1)

    def test_flujo_completo_y_enlace_de_un_uso(self):
        uid, token = self._enlace()
        r = self.client.post("/api/auth/password/reset/confirm/",
                             {"uid": uid, "token": token, "new_password": "Nueva-Clave-2027!"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.login("maria", "Nueva-Clave-2027!").status_code, 200)
        r = self.client.post("/api/auth/password/reset/confirm/",
                             {"uid": uid, "token": token, "new_password": "Otra-Mas-2028!!"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_token_o_uid_invalidos(self):
        uid, _ = self._enlace()
        for d in ({"uid": uid, "token": "x-y"}, {"uid": "zzz", "token": "x-y"}):
            r = self.client.post("/api/auth/password/reset/confirm/", {**d, "new_password": "Nueva-Clave-2027!"}, format="json")
            self.assertEqual(r.status_code, 400)

    def test_usuario_inactivo_no_recibe_correo(self):
        self.user.is_active = False
        self.user.save()
        self.client.post("/api/auth/password/reset/", {"email": "maria@ejemplo.pe"}, format="json")
        self.assertEqual(len(mail.outbox), 0)

    def test_clave_debil_en_reset(self):
        uid, token = self._enlace()
        r = self.client.post("/api/auth/password/reset/confirm/", {"uid": uid, "token": token, "new_password": "123"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_reset_revoca_sesiones(self):
        self.login("maria")
        valor = self.client.cookies[COOKIE].value
        uid, token = self._enlace()
        self.client.post("/api/auth/password/reset/confirm/",
                         {"uid": uid, "token": token, "new_password": "Nueva-Clave-2027!"}, format="json")
        c = APIClient()
        c.cookies[COOKIE] = valor
        self.assertEqual(c.post("/api/auth/refresh/").status_code, 401)


class AdminUsuariosTests(BaseTest):
    def setUp(self):
        super().setUp()
        self.admin = crear("admin", ADMINISTRADOR)
        self.cajero = crear("caja", CAJERO)

    def test_solo_administrador_accede(self):
        for rol in (CAJERO, DESPACHADOR, CONDUCTOR, CLIENTE):
            crear(f"u_{rol}", rol)
            c = APIClient()
            tok = self.login(f"u_{rol}", client=c).data["access"]
            c.credentials(HTTP_AUTHORIZATION=f"Bearer {tok}")
            for url in ("/api/usuarios/", "/api/roles/", "/api/auditoria/"):
                self.assertEqual(c.get(url).status_code, 403, (rol, url))
        self.assertEqual(APIClient().get("/api/usuarios/").status_code, 401)

    def test_permiso_denegado_queda_en_bitacora(self):
        self.autenticar("caja")
        self.client.get("/api/usuarios/")
        self.assertTrue(RegistroAuditoria.objects.filter(accion="PERMISO_DENEGADO", usuario=self.cajero).exists())

    def test_superusuario_cuenta_como_administrador(self):
        User.objects.create_superuser("root", "root@ejemplo.pe", CLAVE)
        self.autenticar("root")
        self.assertEqual(self.client.get("/api/usuarios/").status_code, 200)

    def test_crear_listar_filtrar(self):
        self.autenticar("admin")
        r = self.client.post("/api/usuarios/", {
            "username": "chofer1", "email": "c1@ejemplo.pe", "password": CLAVE, "first_name": "Juan",
            "last_name": "Pérez", "roles": [CONDUCTOR, CONDUCTOR]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["roles"], [CONDUCTOR])
        r = self.client.get("/api/usuarios/?rol=conductor")
        self.assertEqual([u["username"] for u in r.data["results"]], ["chofer1"])
        r = self.client.get("/api/usuarios/?search=caja")
        self.assertEqual(r.data["count"], 1)

    def test_rol_inexistente_rechazado(self):
        self.autenticar("admin")
        r = self.client.post("/api/usuarios/", {"username": "x1x", "email": "x@ejemplo.pe", "password": CLAVE,
                                                 "first_name": "a", "last_name": "b", "roles": ["superman"]}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_editar_roles_y_auditar(self):
        self.autenticar("admin")
        r = self.client.patch(f"/api/usuarios/{self.cajero.pk}/", {"roles": [DESPACHADOR]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["roles"], [DESPACHADOR])
        reg = RegistroAuditoria.objects.filter(accion="MODIFICAR", entidad_id=str(self.cajero.pk)).latest("id")
        self.assertEqual(reg.cambios["roles"], [[CAJERO], [DESPACHADOR]])

    def test_no_hay_borrado_ni_cambio_de_clave_por_esta_ruta(self):
        self.autenticar("admin")
        self.assertEqual(self.client.delete(f"/api/usuarios/{self.cajero.pk}/").status_code, 405)
        self.client.patch(f"/api/usuarios/{self.cajero.pk}/", {"password": "Hack-2027-Hack!"}, format="json")
        self.assertEqual(self.login("caja", CLAVE, client=APIClient()).status_code, 200)

    def test_desactivar_revoca_sesiones(self):
        c = APIClient()
        self.login("caja", client=c)
        valor = c.cookies[COOKIE].value
        self.autenticar("admin")
        r = self.client.post(f"/api/usuarios/{self.cajero.pk}/desactivar/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data["is_active"])
        o = APIClient()
        o.cookies[COOKIE] = valor
        self.assertEqual(o.post("/api/auth/refresh/").status_code, 401)
        self.assertEqual(self.login("caja", client=APIClient()).status_code, 401)
        self.assertEqual(self.client.post(f"/api/usuarios/{self.cajero.pk}/activar/").data["is_active"], True)
        self.assertEqual(self.login("caja", client=APIClient()).status_code, 200)

    def test_admin_no_puede_desactivarse_ni_quitarse_el_rol(self):
        self.autenticar("admin")
        self.assertEqual(self.client.post(f"/api/usuarios/{self.admin.pk}/desactivar/").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/usuarios/{self.admin.pk}/", {"is_active": False}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(f"/api/usuarios/{self.admin.pk}/", {"roles": [CAJERO]}, format="json").status_code, 400)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_cerrar_sesiones(self):
        c = APIClient()
        self.login("caja", client=c)
        valor = c.cookies[COOKIE].value
        self.autenticar("admin")
        r = self.client.post(f"/api/usuarios/{self.cajero.pk}/cerrar-sesiones/")
        self.assertEqual(r.data["sesiones"], 1)
        o = APIClient()
        o.cookies[COOKIE] = valor
        self.assertEqual(o.post("/api/auth/refresh/").status_code, 401)
        self.assertEqual(BlacklistedToken.objects.count(), 1)

    def test_roles_con_conteo(self):
        self.autenticar("admin")
        r = self.client.get("/api/roles/")
        d = {x["nombre"]: x["usuarios_activos"] for x in r.data}
        self.assertEqual(set(d), set(TODOS))
        self.assertEqual((d[ADMINISTRADOR], d[CAJERO], d[CLIENTE]), (1, 1, 0))
