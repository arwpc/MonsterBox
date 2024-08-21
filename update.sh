#!/bin/bash

# Prompt the user for commit comments
echo "Enter Comments:"
read comments

# Add all changes to the staging area
git add .

# Commit the changes with the provided comments
git commit -m "$comments"

# Push the changes to the remote repository
git push
