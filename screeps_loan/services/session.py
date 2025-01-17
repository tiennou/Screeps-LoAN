from flask import Flask, session
from flask.sessions import SessionInterface
from beaker.middleware import SessionMiddleware
from screeps_loan import app
import os


cache_root = os.environ["CACHE_ROOT"]
secret_key = os.environ["SECRET_KEY"]

session_opts = {
    "session.auto": True,
    "session.data_dir": cache_root + "/sessions",
    "session.secret": secret_key,
    "session.type": "file",
    "session.timeout": 7200
}


class BeakerSessionInterface(SessionInterface):
    def open_session(self, app, request):
        session = request.environ["beaker.session"]
        return session

    def save_session(self, app, session, response):
        session.save()


app.wsgi_app = SessionMiddleware(app.wsgi_app, session_opts)
app.session_interface = BeakerSessionInterface()
