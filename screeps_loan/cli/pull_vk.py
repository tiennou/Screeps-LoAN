import click
from screeps_loan import app
import urllib.request as request
import os
import urllib

VK_HOST = os.environ["VK_HOST"]
VK_ROOT = os.path.join(app.root_path, "static", "vk")


@app.cli.command()
def pull_vk():
    click.echo("Pulling Voight-Kampff data")

    files = [
        "/bots/members.json",
        "/bots/league.json",
        "/battles.json",
        "/battles_full.json",
    ]

    for file in files:
        try:
            click.echo(f"Pulling {VK_HOST + file} to {VK_ROOT + file}")
            request.urlretrieve(VK_HOST + file, VK_ROOT + file)
        except Exception as e:
            click.echo(e)
            pass
