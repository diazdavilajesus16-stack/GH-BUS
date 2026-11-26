from datetime import timedelta
from decimal import Decimal
from unittest.mock import call, patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.assistant import buscar_viajes_disponibles
from apps.finance.models import CashMovement, CashRegister
from apps.fleet.models import AsientoPlantilla, ConfiguracionAsientos, Vehiculo
from apps.passengers.models import Passenger
from apps.reservations.models import Reservation, ReservationSeat
from apps.reservations.services import asientos_ocupados_por_viaje
from apps.routes.models import Ciudad, Ruta, TipoServicio
from apps.tickets.models import Ticket
from apps.trips.models import Viaje
from apps.users.roles import ADMINISTRADOR, CAJERO, CLIENTE


class ReservationPaymentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username='reservation-test',
            email='reservation-test@example.com',
            password='test-password'
        )
        client_group, _ = Group.objects.get_or_create(name=CLIENTE)
        self.user.groups.add(client_group)
        self.client.force_authenticate(user=self.user)
        origin = Ciudad.objects.create(nombre='Origen', departamento='Prueba')
        destination = Ciudad.objects.create(nombre='Destino', departamento='Prueba')
        service = TipoServicio.objects.create(codigo='TEST', nombre='Servicio de prueba')
        route = Ruta.objects.create(
            codigo='TEST-ROUTE',
            nombre='Origen - Destino',
            origen=origin,
            destino=destination,
            duracion_min=60
        )
        departure = timezone.now() + timedelta(days=1)
        self.trip = Viaje.objects.create(
            codigo='TEST-TRIP',
            ruta=route,
            tipo_servicio=service,
            salida_programada=departure,
            llegada_programada=departure + timedelta(hours=1),
            precio_base=Decimal('25.00'),
            creado_por=self.user
        )
        self.passenger_data = {
            'document_number': '12345678',
            'first_name': 'Pasajero',
            'last_name': 'Prueba',
            'email': 'pasajero@example.com',
            'phone': '999999999'
        }

    def create_reservation(self, seats=None):
        response = self.client.post('/api/reservations/', {
            'trip_id': self.trip.pk,
            'seats': seats or [1],
            'passenger': self.passenger_data
        }, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        return response.data['reservation_id']

    def assign_vehicle_with_seats(self, count=2):
        configuration = ConfiguracionAsientos.objects.create(
            nombre='Configuración de prueba',
            pisos=1,
            total_asientos=count,
        )
        for seat_number in range(1, count + 1):
            AsientoPlantilla.objects.create(
                configuracion=configuration,
                numero=seat_number,
                piso=1,
                fila=1,
                columna=seat_number,
            )
        vehicle = Vehiculo.objects.create(
            placa='TEST-001',
            marca='Prueba',
            modelo='Bus',
            anio=2025,
            configuracion_asientos=configuration,
            tipo_servicio=self.trip.tipo_servicio,
        )
        self.trip.vehiculo = vehicle
        self.trip.save(update_fields=['vehiculo'])

    def test_creating_reservation_creates_ticket_with_passenger(self):
        reservation_id = self.create_reservation()

        self.assertEqual(Reservation.objects.get(pk=reservation_id).usuario, self.user)
        ticket = Ticket.objects.get(reservation_id=reservation_id)
        self.assertEqual(ticket.passenger.document_number, self.passenger_data['document_number'])
        self.assertEqual(ticket.status, 'RESERVED')
        self.assertIsNone(ticket.qr_code)

    def test_creating_reservation_publishes_each_held_seat(self):
        with patch('apps.reservations.views.publish_event') as publish_event:
            self.create_reservation([1, 2])

        self.assertEqual(publish_event.call_args_list, [
            call('seat.updated', {'trip_id': self.trip.pk, 'seat_number': 1, 'status': 'held'}),
            call('seat.updated', {'trip_id': self.trip.pk, 'seat_number': 2, 'status': 'held'}),
        ])

    def test_reservation_rejects_duplicate_seats(self):
        response = self.client.post('/api/reservations/', {
            'trip_id': self.trip.pk,
            'seats': [1, 1],
            'passenger': self.passenger_data,
        }, format='json')

        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Reservation.objects.count(), 0)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_reservation_rejects_seat_missing_from_vehicle_configuration(self):
        self.assign_vehicle_with_seats()
        self.trip.vehiculo.configuracion_asientos.asientos.filter(numero=2).delete()

        response = self.client.post('/api/reservations/', {
            'trip_id': self.trip.pk,
            'seats': [2],
            'passenger': self.passenger_data,
        }, format='json')

        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Reservation.objects.count(), 0)

    def test_seat_map_uses_assigned_vehicle_configuration(self):
        self.assign_vehicle_with_seats()

        response = self.client.get(f'/api/trips/{self.trip.pk}/seats/')

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([seat['seat_number'] for seat in response.data['seats']], [1, 2])

    def test_anonymous_users_cannot_create_or_pay_reservations(self):
        self.client.force_authenticate(user=None)
        response = self.client.post('/api/reservations/', {
            'trip_id': self.trip.pk,
            'seats': [1],
            'passenger': self.passenger_data
        }, format='json')
        self.assertEqual(response.status_code, 401)

        reservation = Reservation.objects.create(
            trip=self.trip,
            usuario=self.user,
            total_amount=Decimal('25.00')
        )
        payment = self.client.post(f'/api/reservations/{reservation.pk}/pay/', format='json')
        self.assertEqual(payment.status_code, 401)

    def test_customer_can_only_list_and_pay_own_reservations(self):
        own_reservation_id = self.create_reservation()
        other_user = get_user_model().objects.create_user(
            username='other-customer',
            email='other-customer@example.com',
            password='test-password'
        )
        other_user.groups.add(Group.objects.get(name=CLIENTE))
        other_reservation = Reservation.objects.create(
            trip=self.trip,
            usuario=other_user,
            total_amount=Decimal('25.00')
        )

        payment = self.client.post(f'/api/reservations/{own_reservation_id}/pay/', format='json')
        self.assertEqual(payment.status_code, 200, payment.content)
        page = self.client.get('/api/reservations/my/')
        self.assertEqual(page.status_code, 200, page.content)
        self.assertEqual(page.data['count'], 1)
        self.assertEqual(page.data['results'][0]['id'], str(own_reservation_id))
        self.assertEqual(
            page.data['results'][0]['tickets'][0]['qr_code'],
            payment.data['tickets'][0]['qr_code']
        )

        self.client.force_authenticate(user=other_user)
        other_page = self.client.get('/api/reservations/my/')
        self.assertEqual(other_page.data['count'], 1)
        self.assertEqual(other_page.data['results'][0]['id'], str(other_reservation.pk))

        self.client.force_authenticate(user=self.user)
        denied_payment = self.client.post(
            f'/api/reservations/{other_reservation.pk}/pay/',
            format='json'
        )
        self.assertEqual(denied_payment.status_code, 404)
        other_reservation.refresh_from_db()
        self.assertEqual(other_reservation.status, 'PENDING')

    def test_administrator_can_list_reservations_from_all_customers(self):
        self.create_reservation()
        other_user = get_user_model().objects.create_user(
            username='admin-visible-customer',
            email='admin-visible-customer@example.com',
            password='test-password'
        )
        other_user.groups.add(Group.objects.get(name=CLIENTE))
        Reservation.objects.create(
            trip=self.trip,
            usuario=other_user,
            total_amount=Decimal('25.00')
        )
        administrator = get_user_model().objects.create_user(
            username='reservation-admin',
            email='reservation-admin@example.com',
            password='test-password'
        )
        administrator.groups.add(Group.objects.get_or_create(name=ADMINISTRADOR)[0])
        self.client.force_authenticate(user=administrator)

        response = self.client.get('/api/reservations/management/')

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['count'], 2)

    def test_staff_sales_are_not_attached_to_the_staff_account(self):
        cashier = get_user_model().objects.create_user(
            username='reservation-cashier',
            email='reservation-cashier@example.com',
            password='test-password'
        )
        cashier.groups.add(Group.objects.get_or_create(name=CAJERO)[0])
        self.client.force_authenticate(user=cashier)

        response = self.client.post('/api/reservations/', {
            'trip_id': self.trip.pk,
            'seats': [1],
            'passenger': self.passenger_data
        }, format='json')

        self.assertEqual(response.status_code, 201, response.content)
        self.assertIsNone(Reservation.objects.get(pk=response.data['reservation_id']).usuario)

    def test_payment_confirms_reservation_and_generates_qr(self):
        reservation_id = self.create_reservation()

        with patch('apps.reservations.views.publish_event') as publish_event:
            response = self.client.post(f'/api/reservations/{reservation_id}/pay/', format='json')

        self.assertEqual(response.status_code, 200, response.content)
        publish_event.assert_called_once_with(
            'seat.updated',
            {'trip_id': self.trip.pk, 'seat_number': 1, 'status': 'sold'},
        )
        self.assertEqual(response.data['message'], 'Pago simulado correctamente')
        self.assertEqual(len(response.data['tickets']), 1)
        self.assertTrue(response.data['tickets'][0]['qr_code'])
        reservation = Reservation.objects.get(pk=reservation_id)
        ticket = reservation.tickets.get()
        self.assertEqual(reservation.status, 'CONFIRMED')
        self.assertEqual(ticket.status, 'PAID')
        self.assertEqual(ticket.qr_code, response.data['tickets'][0]['qr_code'])

    def test_customer_cash_selection_keeps_reservation_pending_for_cashier(self):
        reservation_id = self.create_reservation()

        response = self.client.post(
            f'/api/reservations/{reservation_id}/pay/',
            {'payment_method': 'CASH'},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['status'], 'PENDING')
        self.assertEqual(response.data['payment_method'], 'CASH')
        self.assertEqual(response.data['tickets'], [])
        reservation = Reservation.objects.get(pk=reservation_id)
        self.assertEqual(reservation.status, 'PENDING')
        self.assertEqual(reservation.payment_method, 'CASH')
        self.assertEqual(reservation.tickets.get().status, 'RESERVED')
        self.assertFalse(CashMovement.objects.filter(reservation=reservation).exists())
        repeated_customer_request = self.client.post(
            f'/api/reservations/{reservation_id}/pay/',
            format='json',
        )
        self.assertEqual(repeated_customer_request.status_code, 200)
        self.assertEqual(repeated_customer_request.data['status'], 'PENDING')
        self.assertFalse(CashMovement.objects.filter(reservation=reservation).exists())

    def test_cashier_confirms_cash_only_after_opening_register(self):
        reservation_id = self.create_reservation()
        self.user.groups.add(Group.objects.get_or_create(name=CAJERO)[0])

        no_register_response = self.client.post(
            f'/api/reservations/{reservation_id}/pay/',
            {'payment_method': 'CASH'},
            format='json',
        )
        self.assertEqual(no_register_response.status_code, 400)
        self.assertEqual(Reservation.objects.get(pk=reservation_id).status, 'PENDING')

        caja = CashRegister.objects.create(owner=self.user, opening_amount=Decimal('100.00'))
        response = self.client.post(
            f'/api/reservations/{reservation_id}/pay/',
            {'payment_method': 'CASH'},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['status'], 'CONFIRMED')
        reservation = Reservation.objects.get(pk=reservation_id)
        self.assertEqual(reservation.payment_method, 'CASH')
        self.assertEqual(reservation.tickets.get().status, 'PAID')
        movement = CashMovement.objects.get(reservation=reservation)
        self.assertEqual(movement.cash_register, caja)
        self.assertIn('efectivo en caja', movement.description)

    def test_yape_and_visa_are_recorded_as_simulated_payments(self):
        for seat_number, method in ((1, 'YAPE'), (2, 'VISA')):
            with self.subTest(method=method):
                reservation_id = self.create_reservation([seat_number])
                response = self.client.post(
                    f'/api/reservations/{reservation_id}/pay/',
                    {'payment_method': method},
                    format='json',
                )

                self.assertEqual(response.status_code, 200, response.content)
                self.assertEqual(response.data['payment_method'], method)
                self.assertIn('Pago simulado correctamente', response.data['message'])
                reservation = Reservation.objects.get(pk=reservation_id)
                self.assertEqual(reservation.status, 'CONFIRMED')
                self.assertEqual(reservation.payment_method, method)
                self.assertIn('simulado', CashMovement.objects.get(reservation=reservation).description)

    def test_non_cash_staff_payments_do_not_increase_cash_register_balance(self):
        self.user.groups.add(Group.objects.get_or_create(name=CAJERO)[0])
        register = CashRegister.objects.create(owner=self.user, opening_amount=Decimal('100.00'))

        for seat_number, method in ((1, 'YAPE'), (2, 'VISA')):
            with self.subTest(method=method):
                reservation_id = self.create_reservation([seat_number])
                response = self.client.post(
                    f'/api/reservations/{reservation_id}/pay/',
                    {'payment_method': method},
                    format='json',
                )

                self.assertEqual(response.status_code, 200, response.content)
                movement = CashMovement.objects.get(reservation_id=reservation_id)
                self.assertIsNone(movement.cash_register)

        summary = self.client.get('/api/cash/summary/')
        self.assertEqual(summary.status_code, 200, summary.content)
        self.assertEqual(summary.data['current_register']['expected_amount'], Decimal('100.00'))

    def test_confirmed_seats_remain_occupied_after_the_pending_hold_expires(self):
        reservation_id = self.create_reservation()
        payment = self.client.post(f'/api/reservations/{reservation_id}/pay/', format='json')
        self.assertEqual(payment.status_code, 200, payment.content)

        reservation = Reservation.objects.get(pk=reservation_id)
        reservation.expires_at = timezone.now() - timedelta(seconds=1)
        reservation.save(update_fields=['expires_at'])

        ocupados = asientos_ocupados_por_viaje([self.trip.pk])

        self.assertSetEqual(ocupados[self.trip.pk], {1})

    def test_expired_pending_seats_are_available(self):
        reservation_id = self.create_reservation()
        reservation = Reservation.objects.get(pk=reservation_id)
        reservation.expires_at = timezone.now() - timedelta(seconds=1)
        reservation.save(update_fields=['expires_at'])

        ocupados = asientos_ocupados_por_viaje([self.trip.pk])

        self.assertEqual(ocupados, {})

    def test_assistant_search_returns_real_trip_and_available_seat_count(self):
        reservation = Reservation.objects.create(
            trip=self.trip,
            total_amount=Decimal('25.00'),
            status='CONFIRMED',
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        ReservationSeat.objects.create(reservation=reservation, seat_number=1)
        fecha_salida = timezone.localtime(self.trip.salida_programada).date()

        viajes, hay_mas_resultados = buscar_viajes_disponibles(
            'Origen',
            'Destino',
            fecha_salida,
        )

        self.assertFalse(hay_mas_resultados)
        self.assertEqual(len(viajes), 1)
        self.assertEqual(viajes[0]['codigo'], self.trip.codigo)
        self.assertEqual(viajes[0]['asientos_disponibles'], 39)

    @override_settings(GEMINI_API_KEY='')
    def test_assistant_suggests_future_dates_when_requested_date_has_no_trip(self):
        fecha_solicitada = timezone.localdate() + timedelta(days=30)

        response = self.client.post(
            '/api/assistant/chat/',
            {
                'origin': 'Origen',
                'destination': 'Destino',
                'departure_date': fecha_solicitada.isoformat(),
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn('No hay viajes', response.data['answer'])
        self.assertIn('otras fechas', response.data['answer'])
        self.assertTrue(response.data['trips_are_alternatives'])
        self.assertGreater(len(response.data['trips']), 0)
        self.assertTrue(
            all(
                trip['salida'][:10] != fecha_solicitada.isoformat()
                for trip in response.data['trips']
            )
        )

    def test_paid_reservation_qr_validates_for_boarding(self):
        reservation_id = self.create_reservation()
        payment = self.client.post(f'/api/reservations/{reservation_id}/pay/', format='json')
        self.assertEqual(payment.status_code, 200, payment.content)

        group, _ = Group.objects.get_or_create(name=ADMINISTRADOR)
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)
        qr_code = payment.data['tickets'][0]['qr_code']
        response = self.client.post('/api/tickets/validate/', {'qr_code': qr_code}, format='json')

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['ticket']['status'], 'BOARDED')
        ticket = Ticket.objects.get(reservation_id=reservation_id)
        self.assertEqual(ticket.qr_code, qr_code)
        self.assertEqual(ticket.status, 'BOARDED')

    def test_expired_reservation_cannot_be_paid(self):
        reservation_id = self.create_reservation()
        reservation = Reservation.objects.get(pk=reservation_id)
        reservation.expires_at = timezone.now() - timedelta(seconds=1)
        reservation.save(update_fields=['expires_at'])

        response = self.client.post(f'/api/reservations/{reservation_id}/pay/', format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], 'La reserva ha expirado.')
        reservation.refresh_from_db()
        ticket = reservation.tickets.get()
        self.assertEqual(reservation.status, 'EXPIRED')
        self.assertEqual(ticket.status, 'RESERVED')
        self.assertIsNone(ticket.qr_code)

    def test_cannot_create_reservation_after_trip_departure(self):
        self.trip.salida_programada = timezone.now() - timedelta(minutes=1)
        self.trip.save(update_fields=['salida_programada'])

        response = self.client.post('/api/reservations/', {
            'trip_id': self.trip.pk,
            'seats': [1],
            'passenger': self.passenger_data
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], 'El viaje ya salió y no está disponible para reservas.')
        self.assertEqual(Reservation.objects.count(), 0)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_cannot_pay_reservation_after_trip_is_finalized(self):
        reservation_id = self.create_reservation()
        self.trip.estado = 'FINALIZADO'
        self.trip.save(update_fields=['estado'])

        response = self.client.post(f'/api/reservations/{reservation_id}/pay/', format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('viaje que ya salió o fue cancelado', response.data['error'])
        reservation = Reservation.objects.get(pk=reservation_id)
        self.assertEqual(reservation.status, 'PENDING')
        self.assertEqual(reservation.tickets.get().status, 'RESERVED')
        self.assertFalse(CashMovement.objects.filter(reservation=reservation).exists())

    def test_repeated_payment_does_not_duplicate_ticket_or_qr(self):
        reservation_id = self.create_reservation()
        first_payment = self.client.post(f'/api/reservations/{reservation_id}/pay/', format='json')
        self.assertEqual(first_payment.status_code, 200, first_payment.content)
        qr_code = first_payment.data['tickets'][0]['qr_code']

        repeated_payment = self.client.post(f'/api/reservations/{reservation_id}/pay/', format='json')

        self.assertEqual(repeated_payment.status_code, 400)
        self.assertEqual(Ticket.objects.filter(reservation_id=reservation_id).count(), 1)
        ticket = Ticket.objects.get(reservation_id=reservation_id)
        self.assertEqual(ticket.status, 'PAID')
        self.assertEqual(ticket.qr_code, qr_code)

    def test_cashier_can_list_reservations_with_trip_passenger_and_seats(self):
        reservation_id = self.create_reservation()
        group, _ = Group.objects.get_or_create(name=CAJERO)
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        response = self.client.get('/api/reservations/management/')

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['count'], 1)
        reservation = response.data['results'][0]
        self.assertEqual(reservation['id'], str(reservation_id))
        self.assertEqual(reservation['trip_code'], self.trip.codigo)
        self.assertEqual(reservation['origin'], 'Origen')
        self.assertEqual(reservation['destination'], 'Destino')
        self.assertEqual(reservation['passenger_name'], 'Pasajero Prueba')
        self.assertEqual(reservation['seat_numbers'], [1])

    def test_reservation_list_requires_cashier_or_administrator_role(self):
        self.create_reservation()

        self.client.force_authenticate(user=None)
        anonymous_response = self.client.get('/api/reservations/management/')
        self.assertEqual(anonymous_response.status_code, 401)

        self.client.force_authenticate(user=self.user)
        client_response = self.client.get('/api/reservations/management/')
        self.assertEqual(client_response.status_code, 403)

    def test_payment_without_tickets_keeps_reservation_pending(self):
        reservation = Reservation.objects.create(
            trip=self.trip,
            usuario=self.user,
            total_amount=Decimal('25.00')
        )
        ReservationSeat.objects.create(reservation=reservation, seat_number=1)

        response = self.client.post(f'/api/reservations/{reservation.pk}/pay/', format='json')

        self.assertEqual(response.status_code, 400)
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, 'PENDING')

    def test_ticket_creation_failure_rolls_back_reservation(self):
        with patch('apps.reservations.views.Ticket.save', side_effect=RuntimeError('test failure')):
            response = self.client.post('/api/reservations/', {
                'trip_id': self.trip.pk,
                'seats': [1],
                'passenger': self.passenger_data
            }, format='json')

        self.assertEqual(response.status_code, 500)
        self.assertEqual(Passenger.objects.count(), 0)
        self.assertEqual(Reservation.objects.count(), 0)
        self.assertEqual(ReservationSeat.objects.count(), 0)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_payment_failure_rolls_back_confirmation_and_ticket_status(self):
        reservation_id = self.create_reservation()

        with patch('apps.reservations.views.Ticket.save', side_effect=RuntimeError('test failure')):
            response = self.client.post(f'/api/reservations/{reservation_id}/pay/', format='json')

        self.assertEqual(response.status_code, 500)
        reservation = Reservation.objects.get(pk=reservation_id)
        ticket = reservation.tickets.get()
        self.assertEqual(reservation.status, 'PENDING')
        self.assertIsNone(reservation.confirmed_at)
        self.assertEqual(ticket.status, 'RESERVED')
        self.assertIsNone(ticket.qr_code)
