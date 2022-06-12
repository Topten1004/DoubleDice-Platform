#!/bin/sh

set -e

npx hardhat compile # to generate ./generated/abi/DoubleDice.json
mkdir --verbose --parents ./subgraph/generated
rm --verbose --force ./subgraph/generated/*
cat ./generated/abi/DoubleDice.json | jq 'del(.[] | select(.type == "error"))' > ./subgraph/generated/DoubleDice.no-custom-errors.json
npx envsub --protect --env-file .env ./subgraph/subgraph.template.yaml ./subgraph/generated/subgraph.yaml
npx envsub --protect --env-file .env ./subgraph/assemblyscript/env.template.ts ./subgraph/generated/env.ts
npx graph codegen ./subgraph/generated/subgraph.yaml
