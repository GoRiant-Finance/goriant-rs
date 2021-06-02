#!/bin/bash

spl-token create-token | awk '/Creating token/ {print substr($0,16,44)}' > token_tmp
token=$( cat token_tmp )
spl-token create-account $token | awk '/Creating account/ {print substr($0,18,44)}' > vault_tmp
vault=$( cat vault_tmp )
# MintToChecked 10m
spl-token mint $token 10000000

echo "--------------------------------"
echo "Issue & Mint new token ${token}"

echo "token: ${token}" > token.txt
echo "vault: ${vault}" >> token.txt

echo "--------------------------------"

rm token_tmp vault_tmp

