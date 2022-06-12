| Commit     | Commit message                                                          | Comment |
| ---------- | ----------------------------------------------------------------------- | ------- | 
| `5bd440da` | Delete TIMESLOT_DURATION optimization in return for less complexity     | Commit on which initial audit report is based |
| `e0fca9c9` | audit/ME-01: Replace remaining ERC-20 .transfer with .safeTransfer      | Direct audit recommendation |
| `10abf7ca` | audit/ME-02: Make commitToVirtualFloor nonReentrant                     | Direct audit recommendation |
| `6def4aa8` | audit/ME-02: Comment on all implicitly nonReentrant external calls      | Comments |
| `de79f3d4` | audit/MI-01: Restrict floating ^0.8.0 pragma to 0.8.12                  | Direct audit recommendation |
| `824a38c8` | Configure solhint, handle all warnings except `not-rely-on-time`        | Comments |
| `b5a38f2d` | audit/CR-01: Comment on all block.timestamp manipulation risks          | Review of all block.timestamp uses, as pointed out by audit |
| `09c5c068` | audit/CR-01: Enforce considerable delay between tClose and tResolve     | Audit recommendation enforced as a `require` |
| `41327e96` | audit/CR-01: Make commitToVirtualFloor accept (optional) deadline param | Tackled another potential timestamp-related issue |
| `6f40b340` | Add contractURI method for OpenSea storefront-level metadata            | Minor: An extra parameter on the contract, decoupled from the rest of the contract |
| `e2ffe552` | Add metadata extraData field                                            | Minor: An extra field on the `VirtualFloorMetadataV1` struct |
| `b785fce1` | contract: Minor reordering of variables, for consistency                | |
| `408e2bfb` | Reconfigure optimizer.runs from 200 => 100 for smaller contract         | Quick way to stay below contract-size ceiling without having to change code.|
| `cda8cae1` | New OPERATOR_ROLE, responsible for day-to-day operations                | Still using OpenZeppelin’s AccessControl library, simply reassigned some functions to a new role.|
| `913d66c6`<br />⋮<br />`cec3f987` | contract: Move SimpleOracle into examples/<br />⋮<br />Refactor graph-codegen as script, reorganize subgraph project| *A series of commits that do not impact the deployed contract bytecode in any way* |
| `03b3de76` | Revert "Work around graphprotocol ethereum.decode limitation"           | Minor: Changes to `VirtualFloorMetadataV1` struct|
| `aae68fcc` | Finally work around Graph ethereum.decode tuple-array bug cleanly       | New `GraphHelper` contract, but is outside audit scope.<br />Audited `DoubleDice` contract does not reference it;<br />its only purpose is for the Graph indexer to invoke a pure function on it
| `3fea8d3a` | Fix: Refund bonusAmount in remaining 2- VF cancellation scenarios       | Contract bugfix |
| `f7363db4` | audit/EN-01: Drop redundant call to (empty) super._beforeTokenTransfer  | |
| `c32436c9` | audit/EN-01: Check paused() before anything else                        | Direct audit minor enhancment recommendation |
| `8e857418` | audit/EN-01: Note about order of checks                                 | Comments |
| `1b91236f` | audit/EN-02: Assert if-condition handles all possible VirtualFloorInternalState values | Direct audit enhancement recommendation |
| `18b318cd` | Make use of state local variable                                        | Minor |
