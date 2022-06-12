import { Handler } from '@netlify/functions';
import { request, gql } from 'graphql-request';

const handler: Handler = async (event, context) => {

  // Ex. If the URl is http://localhost:8888/api/metadata/000000000000000000000000000000000000000000000000000000000004cce0.json
  // The [event.path] is api/metadata/000000000000000000000000000000000000000000000000000000000004cce0.json
  // The hexString is 000000000000000000000000000000000000000000000000000000000004cce0

  const splitPath = event.path.split('/');
  const hexString = splitPath[splitPath.length - 1].split('.')[0];

  if (!validateHexDecimal(hexString)) {
    return { statusCode: 400 };
  }
  const queryResult = await request('http://127.0.0.1:8000/subgraphs/name/doubledice-com/doubledice-platform', getQuery(`0x${hexString}`));

  if (!queryResult.data.virtualFloorOutcomeTimeslot) {
    return { statusCode: 404 };
  }

  const result = queryResult.data.virtualFloorOutcomeTimeslot;
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `${result.outcome.virtualFloor.id}#${result.outcome.index}/${result.timeslot.minTimestamp}`,
      description: `Description for VirtualFloor id ${result.outcome.virtualFloor.id}; Outcome #${result.outcome.index}; Timeslot ${result.timeslot.minTimestamp}`,
      image: `data:image/svg+xml;charset=UTF-8,%3csvg width='800' height='600' xmlns='http://www.w3.org/2000/svg'%3e%3cg%3e%3ctitle%3eLayer 1%3c/title%3e%3crect stroke='%23000' id='svg_1' height='124' width='736.99997' y='151' x='30' fill='%23fff'/%3e%3ctext xml:space='preserve' text-anchor='start' font-family='Noto Sans JP' font-size='24' stroke-width='0' id='svg_2' y='218' x='67' stroke='%23000' fill='%23000000'%3e VirtualFloor id ${result.outcome.virtualFloor.id}; Outcome %${result.outcome.index}; Timeslot ${result.timeslot.minTimestamp} %3c/text%3e%3c/g%3e%3c/svg%3e`,
      decimals: result.outcome.virtualFloor.paymentToken.decimals,
    }),
  };

};

const getQuery = (erc1155TokenId: string): string => {

  const query = gql`
    {
      virtualFloorOutcomeTimeslot(where: { id: ${erc1155TokenId} }){
        timeslot {
          minTimestamp
          beta
        }
        outcome {
          index
          virtualFloor {
            id
            paymentToken {
              name
              symbol
              decimals
            }
            state
          }
        }
      }
    
    }
  `;
  return query;
};

const validateHexDecimal = (hexString: string): boolean => {
  return hexString.length == 64 && /^[0-9a-f]+$/.test(hexString);
};

export { handler };

