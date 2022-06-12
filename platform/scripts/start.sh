#!/bin/sh

set -e

if nc -z localhost 5432; then
  echo 'Cannot start if there is a service running on port 5432'
  echo 'Maybe run: "sudo service postgresql stop" or "npm stop"'
  exit 1
fi

docker-compose up &

# Wait for Ganache to respond to a test-request, rather than simply waiting for port 8545 to be up
while ! curl -H "Content-Type: application/json" -X POST --data '{"id":0,"jsonrpc":"2.0","method":"web3_clientVersion","params":[]}' http://localhost:8545; do
  echo "Waiting for Ganache on localhost:8545 to respond to a test-request..."
  sleep 0.5
done

npm run contracts:deploy:local

npm run graph:all:local

docker exec platform_ipfs_1 ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin  '["http://localhost:8080"]'
docker exec platform_ipfs_1 ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
docker restart platform_ipfs_1
