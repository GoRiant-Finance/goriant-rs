#!/bin/bash

anchor build && anchor deploy | awk '/Program Id:/ {print substr($0,13,44)}' > programId.txt

program_id=$( cat programId.txt )

echo "Program ID: ${program_id}"
rm programId.txt

echo "{\"programId\":\"${program_id}\"}" > config.json