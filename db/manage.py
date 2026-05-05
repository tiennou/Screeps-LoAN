#!/usr/bin/env python
import inspect
import os

# sqlalchemy-migrate 0.13 still calls inspect.getargspec (removed in Python 3.11).
if not hasattr(inspect, "getargspec"):

    def getargspec(func):
        spec = inspect.getfullargspec(func)
        return spec.args, spec.varargs, spec.varkw, spec.defaults

    inspect.getargspec = getargspec

from migrate.versioning.shell import main
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    db_url = "postgresql://%s:5432/%s?user=%s&password=%s" % (
        os.environ["DB_HOST"],
        os.environ["DB"],
        os.environ["DB_USERNAME"],
        os.environ["DB_PASSWORD"],
    )
    main(url=db_url, repository="db", debug="False")
