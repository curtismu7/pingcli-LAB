# Talk track

<!-- Generated from server/src/storyData.js by `npm run talk-track`. Do not edit by hand. -->

## Open

This is Northwind Retail. Jordan Ellis wants to stop clicking through the console and script the Northwind Storefront environment. Ping CLI is the tool. The banner says whether we are in Mock or Real.

## Install, configure, authenticate

Each command shows the steps it needs: install, pingcli init for a worker profile, pingone auth login once. The lab writes the profile for you, privately, and never shows the secret.

## Read the directory

Run List users. The raw JSON streams in, then the easy-read table picks the useful columns. The same JSON is what a script would parse.

## Follow the hops

Open the hops: browser to lab, lab to pingcli, pingcli to the PingOne token endpoint once, then to the management API. In Mock those last two are simulated and say so.

## Hand it to an agent

Agent skills turn the CLI into something a coding agent can use safely: install one into a throwaway folder and look at what it would get.

## Close

Fourteen allow-listed, read-only commands; no shell, no free-form input, the secret write-only. Switch to Real to run the same thing against your own environment.

## The scenarios

1. **Check the tool** (`version`). Before Jordan Ellis automates anything, they check which Ping CLI build is installed: the version pins what the commands and output shapes look like. *A pinned CLI version is part of the automation contract.*
2. **What can be configured** (`config_list_keys`). Every setting pingcli reads has a key. The worker client id, secret, environment id and root domain are the four that matter for Northwind Storefront. *Configuration is data: a profile, not a pile of flags.*
3. **Where am I** (`pingone_envs_list`). With a token, Jordan Ellis lists the environments the worker can see, and finds Northwind Storefront and its sandbox. *Authenticate once, then every command reuses the token.*
4. **Who is in the directory** (`pingone_users_list`). The users of Northwind Retail come back as JSON a script can filter: name, username, email, enabled. *pingone api returns the same JSON as the management API, under data._embedded.*
5. **What apps exist** (`pingone_apps_list`). The applications registered for Northwind Retail: web, mobile, single-page and the worker this lab itself uses. *An inventory you can diff in CI beats a screenshot of the console.*
6. **How people sign in** (`pingone_policies_list`). Sign-on policies decide how Northwind Retail users authenticate; the default is the one most people hit. *Read policy before you change it.*
7. **Who can do what** (`pingone_roles_list`). The built-in roles are not environment-scoped, so this is the one command whose URI has no environment id. *Least privilege starts with knowing the roles.*
8. **Hand it to an agent** (`agent_skills_list`). Ping CLI ships agent skills: instructions a coding agent can load so it drives pingcli for Jordan Ellis correctly. *The same allow-listed commands work for a person and for an agent.*
