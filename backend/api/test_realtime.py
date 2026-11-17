import json
from unittest import mock

from django.db import transaction
from django.test import TestCase, override_settings

from .realtime import publish_event, sign_payload

SECRET = "h" * 40


class RealtimeTests(TestCase):
    def test_firma_coincide_con_vector_compartido_con_node(self):
        # Mismo vector que realtime/tests/realtime.test.ts
        firma = sign_payload("secreto-de-prueba", "1700000000", b'{"a":1}')
        self.assertEqual(firma, "a98721d9303971fa0256de8a6f2d9ccc417ccd185bb1591543447256aee3fc6a")

    @override_settings(REALTIME_URL="http://realtime.test:4000", REALTIME_HMAC_SECRET=SECRET)
    def test_publica_evento_firmado_solo_tras_confirmar(self):
        with mock.patch("api.realtime.urllib.request.urlopen") as urlopen:
            with self.captureOnCommitCallbacks(execute=True) as callbacks:
                publish_event("seat.updated", {"trip_id": 5, "seat_number": 12, "status": "sold"})
            self.assertEqual(len(callbacks), 1)
            req = urlopen.call_args.args[0]

        self.assertEqual(req.full_url, "http://realtime.test:4000/internal/events")
        self.assertEqual(json.loads(req.data)["event"], "seat.updated")
        esperada = sign_payload(SECRET, req.get_header("X-ghbus-timestamp"), req.data)
        self.assertEqual(req.get_header("X-ghbus-signature"), esperada)

    @override_settings(REALTIME_URL="http://realtime.test:4000", REALTIME_HMAC_SECRET=SECRET)
    def test_no_publica_si_la_transaccion_se_revierte(self):
        with mock.patch("api.realtime.urllib.request.urlopen") as urlopen:
            try:
                with transaction.atomic():
                    publish_event("seat.updated", {"trip_id": 1, "seat_number": 1, "status": "sold"})
                    raise RuntimeError("falla de negocio")
            except RuntimeError:
                pass
            urlopen.assert_not_called()

    @override_settings(REALTIME_URL="http://realtime.test:4000", REALTIME_HMAC_SECRET=SECRET)
    def test_si_el_servicio_cae_no_se_propaga_el_error(self):
        with mock.patch("api.realtime.urllib.request.urlopen", side_effect=OSError("caído")):
            with self.captureOnCommitCallbacks(execute=True):
                publish_event("trip.status_changed", {"trip_id": 1, "status": "en_ruta"})

    @override_settings(REALTIME_URL="", REALTIME_HMAC_SECRET="")
    def test_sin_configuracion_no_envia_nada(self):
        with mock.patch("api.realtime.urllib.request.urlopen") as urlopen:
            with self.captureOnCommitCallbacks(execute=True):
                publish_event("seat.updated", {"trip_id": 1, "seat_number": 1, "status": "held"})
            urlopen.assert_not_called()
