from setuptools import setup, find_packages

with open("requirements.txt") as f:
	install_requires = f.read().strip().split("\n")

# get version from __version__ variable in towel_portal/__init__.py
from towel_portal import __version__ as version

setup(
	name="towel_portal",
	version=version,
	description="Custom operations portal UI for ERPNext",
	author="Al Wadaq",
	author_email="ghazimemon92@gmail.com",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires,
)
