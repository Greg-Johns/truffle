import { logger } from "@truffle/db/logger";
const debug = logger("db:loaders:commands:compile:sources");

import { IdObject } from "@truffle/db/meta";
import { Load } from "@truffle/db/loaders/types";
import { PrepareBatch, _, Replace } from "@truffle/db/loaders/batch";
import { generateContractsLoad } from "@truffle/db/loaders/resources/contracts";

interface Contract {
  contractName: string;
  abi: any;
  sourcePath: string;
  db: {
    createBytecode: IdObject<DataModel.Bytecode>;
    callBytecode: IdObject<DataModel.Bytecode>;
  };
}

interface Compilation {
  compiler: any;
  sourceIndexes: string[];
  contracts: Contract[];
  db: {
    compilation: IdObject<DataModel.Compilation>;
  };
}

export function* generateCompilationsContractsLoad(
  compilations: Compilation[]
): Load<
  (Compilation & {
    contracts: (Contract & {
      db: {
        contract: IdObject<DataModel.Contract>;
      };
    })[];
  })[]
> {
  const { batch, unbatch } = prepareContractsBatch(compilations);

  const contracts = yield* generateContractsLoad(batch);

  return unbatch(contracts);
}

const prepareContractsBatch: PrepareBatch<
  Replace<Compilation, { contracts: _[] }>[],
  Contract,
  Contract & { db: { contract: IdObject<DataModel.Contract> } },
  DataModel.ContractInput,
  IdObject<DataModel.Contract>
> = structured => {
  const batch = [];
  const breadcrumbs: {
    [index: number]: {
      compilationIndex: number;
      contractIndex: number;
    };
  } = {};

  for (const [compilationIndex, compilation] of structured.entries()) {
    const { contracts } = compilation;

    for (const [contractIndex, contract] of contracts.entries()) {
      breadcrumbs[batch.length] = { contractIndex, compilationIndex };

      batch.push(toContractInput({ contract, compilation }));
    }
  }

  const unbatch = results => {
    const compilations = [];

    for (const [index, result] of results.entries()) {
      const { compilationIndex, contractIndex } = breadcrumbs[index];

      if (!compilations[compilationIndex]) {
        compilations[compilationIndex] = {
          ...structured[compilationIndex],
          contracts: []
        };
      }

      compilations[compilationIndex].contracts[contractIndex] = {
        ...structured[compilationIndex].contracts[contractIndex],
        db: {
          ...structured[compilationIndex].contracts[contractIndex].db,
          contract: result
        }
      };
    }

    return compilations;
  };

  return { batch, unbatch };
};

function toContractInput(options: {
  contract: Contract;
  compilation: Compilation;
}): DataModel.ContractInput {
  const {
    db: { compilation }
  } = options.compilation;

  const {
    contractName: name,
    db: { createBytecode, callBytecode }
  } = options.contract;

  const abi = {
    json: JSON.stringify(options.contract.abi)
  };

  const processedSource = {
    index: options.compilation.sourceIndexes.findIndex(
      sourcePath => sourcePath === options.contract.sourcePath
    )
  };

  return {
    name,
    abi,
    compilation,
    processedSource,
    createBytecode,
    callBytecode
  };
}
