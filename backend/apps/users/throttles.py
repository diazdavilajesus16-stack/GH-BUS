from rest_framework.throttling import AnonRateThrottle


class LoginIPThrottle(AnonRateThrottle):
    scope = "login_ip"


class RegisterThrottle(AnonRateThrottle):
    scope = "register"


class PasswordResetThrottle(AnonRateThrottle):
    scope = "password_reset"
