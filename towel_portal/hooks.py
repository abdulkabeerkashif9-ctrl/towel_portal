app_name = "towel_portal"
app_title = "Towel Portal"
app_publisher = "Towel Portal"
app_description = "Custom operations portal UI for ERPNext"
app_email = "ghazimemon92@gmail.com"
app_license = "mit"

required_apps = ["erpnext"]

# The React single-page app lives at /portal and handles its own routing.
# www/portal.html is a build artifact of frontend/ (see README).
website_route_rules = [
	{"from_route": "/portal/<path:app_path>", "to_route": "portal"},
]

add_to_apps_screen = [
	{
		"name": "towel_portal",
		"logo": "/assets/towel_portal/frontend/logo.svg",
		"title": "Towel Portal",
		"route": "/portal",
	}
]
