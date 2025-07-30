from screeps_loan import app
from flask import send_from_directory


@app.route("/vk/<path:filename>")
def send_vk_file(filename):
    return send_from_directory("static/vk", filename)


@app.route("/scanner/<path:filename>")
def send_scanner_file(filename):
    return send_from_directory("static/scanner", filename)
