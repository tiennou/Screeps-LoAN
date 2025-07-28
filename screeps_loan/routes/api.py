from screeps_loan import app
from flask import send_from_directory


@app.route("/vk/<path:filename>")
def send_vk_file(filename):
    # Using request args for path will expose you to directory traversal attacks
    return send_from_directory("static/vk", filename)
