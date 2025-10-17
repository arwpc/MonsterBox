[x] NAME:Current Task List DESCRIPTION:Root task for conversation __NEW_AGENT__
-[ ] NAME:Finalize DESCRIPTION:Once complete, update README.md and remove outdated information. Include detailed information on testing routines. Do the same with the Memories in Augment to improve our accuracy and reduce human/user intervention in the execution of tasks. Also review the install.sh and ensure that it can be run on a newly created RPI4b and afterwards MonsterBox will test and run flawlessly.
-[ ] NAME:Fix Bugs DESCRIPTION:The file /home/remote/MonsterBox/docs/fninghostile.rtf contains a list of recurring issues, bugs that keep popping up no matter what 400, 500 level testing you do. I want you to hunt these down, test for the cause explicitly, and ensure that they never happen again. THANK YOU!!!
-[ ] NAME:Fix VSCode Testing DESCRIPTION:We seem to have a number of dissimilar tools connected up to this VS Code instance or config or whatever you call it. I want to consolidate testing into one functionaly system that works together. 

Configure VS Code to pull together logs and errors and output from all of the various systems:
Pylance
Mocha
Playwright (local and MCP)
Github MCP (full access to repository error checks)
VS Code MCP can be configured to work with the RPI OS and pull in logs from both MonsterBox and the machine itself

Build this out and integrate it into VS Code Testing and then the MonsterBox testing apparatus.