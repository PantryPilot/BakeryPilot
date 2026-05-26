import pytest
from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app


class _AggRow:
    def __getattr__(self, name):
        return None


class _Scalars:
    def all(self):
        return []

    def first(self):
        return None


class _Result:
    def scalars(self):
        return _Scalars()

    def scalar_one_or_none(self):
        return None

    def scalar(self):
        return 0

    def one(self):
        return _AggRow()

    def all(self):
        return []

    def first(self):
        return None


class _MockSession:
    async def execute(self, *args, **kwargs):
        return _Result()

    async def get(self, *args, **kwargs):
        return None

    def add(self, *args):
        pass

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def refresh(self, *args):
        pass


async def _mock_get_db():
    yield _MockSession()


@pytest.fixture(autouse=True)
def override_db():
    app.dependency_overrides[get_db] = _mock_get_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)
