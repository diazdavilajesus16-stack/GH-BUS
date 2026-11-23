from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """20 por página; `?page_size=` permite pedir más (máx. 200), p. ej. para llenar listas desplegables."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200
