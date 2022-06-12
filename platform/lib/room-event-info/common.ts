import Ajv, { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import { RoomEventInfo } from '../contracts';

const ajv = new Ajv();
addFormats(ajv);

const schema: JSONSchemaType<RoomEventInfo> = {
  type: 'object',
  required: [
    'category',
    'subcategory',
    'title',
    'description',
    'isListed',
    'opponents',
    'outcomes',
    'resultSources',
    'discordChannelId',
  ],
  properties: {
    category: { type: 'string', minLength: 1 },
    subcategory: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    isListed: { type: 'boolean' },
    opponents: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'image'],
        properties: {
          title: { type: 'string', minLength: 1 },
          image: { type: 'string', minLength: 1, format: 'uri' },  // for now a URL, later will be an IPFS content-uri
        },
        additionalProperties: false,
      },
      minItems: 1,
      uniqueItems: true,
    },
    outcomes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1 },
        },
        additionalProperties: false,
      },
      minItems: 2,
      maxItems: 256,
      uniqueItems: true,
    },
    resultSources: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'url'],
        properties: {
          title: { type: 'string', minLength: 1 },
          url: { type: 'string', minLength: 1, format: 'uri' },
        },
        additionalProperties: false,
      },
      minItems: 1,
      uniqueItems: true,
    },
    discordChannelId: {
      type: 'string',
      minLength: 1,
    },
    extraData: {
      type: 'string',
      pattern: '^0x([0-9a-fA-F]{2})*$',
    },
  },
  additionalProperties: false,
};

// ToDo: Extend function so that in addition to JSON validation,
// it also checks that outcome index values are correct and in order,
// category and subcategory match constraints, etc.
export const validateRoomEventInfo = ajv.compile(schema);
