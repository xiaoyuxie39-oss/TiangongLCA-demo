/*
 * Pure matrix-LCA functions for the TianGong teaching bundle.
 * Works as a classic browser script (globalThis.LcaCore) and as CommonJS.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LcaCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STAGE = "stage:";
  const SYSTEM = "system:";

  function zeros(rows, cols) {
    return Array.from({ length: rows }, () => new Float64Array(cols));
  }

  function year(process) {
    const value = Number.parseInt(String(process.year || 0).slice(0, 4), 10);
    return Number.isFinite(value) ? value : 0;
  }

  function geoScore(consumerGeo, providerGeo) {
    const a = String(consumerGeo || "").toUpperCase().split("-").filter(Boolean).reverse();
    const b = String(providerGeo || "").toUpperCase().split("-").filter(Boolean).reverse();
    let score = 0;
    while (score < a.length && score < b.length && a[score] === b[score]) score += 1;
    return score;
  }

  function providerChoice(itemProviders, systemName, stageId, item) {
    return itemProviders[`${systemName}/${stageId}/${item}`]
      || itemProviders[`${stageId}/${item}`]
      || itemProviders[item];
  }

  function resolveProvider(bundle, flow, consumerGeo, consumerUuid, overrides, log) {
    if (overrides[flow]) {
      log.push({ flow, consumer: consumerUuid, provider: overrides[flow], rule: "override" });
      return overrides[flow];
    }
    const candidates = (bundle.producers[flow] || []).filter((uuid) => uuid !== consumerUuid);
    if (!candidates.length) return null;
    if (candidates.length === 1) {
      log.push({ flow, consumer: consumerUuid, provider: candidates[0], rule: "unique" });
      return candidates[0];
    }
    const processes = candidates.map((uuid) => bundle.processes[uuid]);
    const bestScore = Math.max(...processes.map((process) => geoScore(consumerGeo, process.geo)));
    const pool = processes.filter((process) => geoScore(consumerGeo, process.geo) === bestScore);
    pool.sort((a, b) => {
      const geoLength = String(a.geo || "").split("-").length - String(b.geo || "").split("-").length;
      return geoLength || year(b) - year(a) || a.uuid.localeCompare(b.uuid);
    });
    log.push({
      flow,
      consumer: consumerUuid,
      provider: pool[0].uuid,
      rule: `geo-match-${bestScore}+general+latest`,
      n_candidates: candidates.length,
    });
    return pool[0].uuid;
  }

  function dedupeExchanges(exchanges) {
    const seen = new Set();
    const rows = [];
    const variants = new Map();
    let exactDuplicates = 0;
    for (const exchange of exchanges) {
      const key = JSON.stringify([
        exchange.flow,
        exchange.dir,
        Number(exchange.amount || 0),
        Boolean(exchange.ref),
      ]);
      if (seen.has(key)) {
        exactDuplicates += 1;
        continue;
      }
      seen.add(key);
      rows.push(exchange);
      const variantKey = `${exchange.flow}\u0000${exchange.dir}`;
      variants.set(variantKey, (variants.get(variantKey) || 0) + 1);
    }
    return {
      rows,
      exactDuplicates,
      variantFlows: [...variants.entries()]
        .filter(([, count]) => count > 1)
        .map(([key]) => key.split("\u0000")[0]),
    };
  }

  function buildSystem(bundle, choices = {}) {
    if (!bundle || !bundle.systems) throw new TypeError("A case bundle is required");
    if (typeof choices === "string") choices = { system: choices };
    const name = choices.system || choices.systemName || choices.name || Object.keys(bundle.systems)[0];
    const foreground = bundle.systems[name];
    if (!foreground) throw new RangeError(`Unknown system: ${name}`);

    const itemProviders = choices.itemProviders || choices.providers || {};
    const overrides = { ...(bundle.background_overrides || {}), ...(choices.backgroundOverrides || {}) };
    const cols = [];
    const colIndex = Object.create(null);
    const colKind = Object.create(null);
    const colLabel = Object.create(null);
    const stageOfCol = Object.create(null);
    const aEntries = new Map();
    const bEntries = new Map();
    const elemRows = new Map();
    const cutoffs = [];
    const unlinkedOutputs = [];
    const providerLog = [];
    const warnings = [];
    const addonLog = [];

    function addColumn(id, kind, label) {
      if (Object.prototype.hasOwnProperty.call(colIndex, id)) return false;
      colIndex[id] = cols.length;
      cols.push(id);
      colKind[id] = kind;
      colLabel[id] = label;
      return true;
    }

    function addA(rowId, colId, value) {
      const key = `${rowId}\u0000${colId}`;
      aEntries.set(key, (aEntries.get(key) || 0) + value);
    }

    function addB(flow, direction, colId, value) {
      const elementaryKey = `${flow}\u0000${direction}`;
      if (!elemRows.has(elementaryKey)) elemRows.set(elementaryKey, elemRows.size);
      const key = `${elementaryKey}\u0000${colId}`;
      bEntries.set(key, (bEntries.get(key) || 0) + value);
    }

    const systemId = SYSTEM + name;
    addColumn(systemId, "system", foreground.title || name);
    addA(systemId, systemId, 1);
    const queue = [];

    for (const stage of foreground.stages) {
      const stageId = STAGE + stage.id;
      addColumn(stageId, "stage", stage.name);
      stageOfCol[stageId] = stage.id;
      addA(stageId, stageId, 1);
      addA(stageId, systemId, -1);

      for (const input of stage.inputs) {
        if (input.cutoff) {
          cutoffs.push({
            where: `${name}/${stage.id}`,
            item: input.item,
            flow: null,
            amount: input.amount_printed,
            unit: input.unit_printed,
            why: input.why,
          });
          continue;
        }
        const provider = providerChoice(itemProviders, name, stage.id, input.item) || input.provider;
        if (!bundle.processes[provider]) {
          throw new RangeError(`Provider ${provider} for item ${input.item} is not in the bundle`);
        }
        providerLog.push({
          flow: input.flow,
          consumer: stageId,
          provider,
          rule: "foreground-choice",
          item: input.item,
          n_candidates: (bundle.producers[input.flow] || []).length,
        });
        if (addColumn(provider, "process", bundle.processes[provider].name)) queue.push(provider);
        addA(provider, stageId, -Number(input.amount));
      }

      for (const input of stage.inputs) {
        for (const addon of input.addons || []) {
          const amount = Number(addon.per_printed_unit) * Number(input.amount_printed);
          if (addon.type === "emission") {
            addB(addon.flow, addon.dir || "out", stageId, amount);
          } else if (addon.type === "input") {
            const provider = addon.provider;
            if (!bundle.processes[provider]) {
              throw new RangeError(`Add-on provider ${provider} for item ${input.item} is not in the bundle`);
            }
            if (addColumn(provider, "process", bundle.processes[provider].name)) queue.push(provider);
            addA(provider, stageId, -amount);
          }
          addonLog.push({
            stage: stage.id,
            item: input.item,
            type: addon.type,
            flow: addon.flow,
            amount,
            note: addon.note,
            source: addon.source,
          });
        }
      }
    }

    while (queue.length) {
      const uuid = queue.pop();
      const process = bundle.processes[uuid];
      const deduped = dedupeExchanges(process.exchanges);
      if (deduped.exactDuplicates) {
        warnings.push({ process: uuid, kind: "exact_duplicate_rows", n: deduped.exactDuplicates });
      }
      if (deduped.variantFlows.length) {
        warnings.push({ process: uuid, kind: "variant_rows_summed", flows: deduped.variantFlows });
      }

      for (const exchange of deduped.rows) {
        const amount = Number(exchange.amount || 0);
        const flowInfo = bundle.flows[exchange.flow] || {};
        const flowType = flowInfo.type || "";
        if (exchange.ref && exchange.dir === "out") {
          addA(uuid, uuid, amount);
        } else if (flowType.startsWith("Elementary")) {
          addB(exchange.flow, exchange.dir, uuid, amount);
        } else if (
          exchange.dir === "in"
          && flowType.startsWith("Product")
          && exchange.flow === process.ref_flow
        ) {
          // IO sectors consume part of their own output. This is a diagonal
          // net flow, not a separate provider link or an unlinked cut-off.
          addA(uuid, uuid, -amount);
          providerLog.push({
            flow: exchange.flow,
            consumer: uuid,
            provider: uuid,
            rule: "self-netted",
          });
        } else if (exchange.dir === "in" && flowType.startsWith("Product")) {
          const provider = resolveProvider(
            bundle,
            exchange.flow,
            process.geo,
            uuid,
            overrides,
            providerLog,
          );
          if (!provider) {
            cutoffs.push({
              where: uuid,
              item: null,
              flow: exchange.flow,
              name: exchange.name,
              amount,
              unit: flowInfo.unit,
            });
          } else {
            if (addColumn(provider, "process", bundle.processes[provider].name)) queue.push(provider);
            addA(provider, uuid, -amount);
          }
        } else {
          unlinkedOutputs.push({
            process: uuid,
            flow: exchange.flow,
            name: exchange.name,
            dir: exchange.dir,
            amount,
            type: flowType,
          });
        }
      }
    }

    const A = zeros(cols.length, cols.length);
    for (const [key, value] of aEntries) {
      const [rowId, colId] = key.split("\u0000");
      A[colIndex[rowId]][colIndex[colId]] += value;
    }
    const B = zeros(elemRows.size, cols.length);
    for (const [key, value] of bEntries) {
      const parts = key.split("\u0000");
      const elementaryKey = `${parts[0]}\u0000${parts[1]}`;
      B[elemRows.get(elementaryKey)][colIndex[parts[2]]] += value;
    }
    const Q = zeros(bundle.methods.length, elemRows.size);
    bundle.methods.forEach((method, methodIndex) => {
      const factors = new Map(
        method.factors.filter((factor) => factor.length === 3)
          .map((factor) => [`${factor[0]}\u0000${factor[1]}`, Number(factor[2])]),
      );
      for (const [key, rowIndex] of elemRows) {
        Q[methodIndex][rowIndex] = factors.get(key) || 0;
      }
    });
    const demand = new Float64Array(cols.length);
    demand[colIndex[systemId]] = 1;
    const zeroDiagonal = cols.filter((id, index) => A[index][index] === 0);
    if (zeroDiagonal.length) {
      throw new Error(`${zeroDiagonal.length} column(s) have no reference output: ${zeroDiagonal.slice(0, 5).join(", ")}`);
    }

    const elemKeys = Array.from(elemRows.keys()).map((key) => {
      const [flow, dir] = key.split("\u0000");
      return { flow, dir };
    });
    return {
      bundle,
      name,
      foreground,
      A,
      B,
      Q,
      demand,
      cols,
      colIndex,
      colKind,
      colLabel,
      stageOfCol,
      elemKeys,
      methods: bundle.methods,
      cutoffs,
      unlinkedOutputs,
      providerLog,
      warnings,
      addonLog,
      aEntries,
    };
  }

  function gaussianSolve(matrix, rhs) {
    const n = matrix.length;
    if (rhs.length !== n) throw new RangeError("Demand length does not match A");
    const work = matrix.map((row, index) => {
      const copy = new Float64Array(n + 1);
      copy.set(row);
      copy[n] = Number(rhs[index]);
      return copy;
    });

    for (let pivot = 0; pivot < n; pivot += 1) {
      let best = pivot;
      for (let row = pivot + 1; row < n; row += 1) {
        if (Math.abs(work[row][pivot]) > Math.abs(work[best][pivot])) best = row;
      }
      if (!Number.isFinite(work[best][pivot]) || Math.abs(work[best][pivot]) < 1e-30) {
        throw new Error(`Technology matrix is singular at column ${pivot}`);
      }
      if (best !== pivot) [work[pivot], work[best]] = [work[best], work[pivot]];
      for (let row = pivot + 1; row < n; row += 1) {
        const factor = work[row][pivot] / work[pivot][pivot];
        if (factor === 0) continue;
        work[row][pivot] = 0;
        for (let col = pivot + 1; col <= n; col += 1) {
          work[row][col] -= factor * work[pivot][col];
        }
      }
    }

    const result = new Float64Array(n);
    for (let row = n - 1; row >= 0; row -= 1) {
      let value = work[row][n];
      for (let col = row + 1; col < n; col += 1) value -= work[row][col] * result[col];
      result[row] = value / work[row][row];
    }
    return result;
  }

  function solve(system, demand = system.demand) {
    return gaussianSolve(system.A, demand);
  }

  function multiplyMatrixVector(matrix, vector) {
    return Float64Array.from(matrix, (row) => {
      let total = 0;
      for (let i = 0; i < row.length; i += 1) total += row[i] * vector[i];
      return total;
    });
  }

  function lcia(system, scaling) {
    const inventory = multiplyMatrixVector(system.B, scaling);
    const impacts = multiplyMatrixVector(system.Q, inventory);
    return { inventory, impacts };
  }

  function contributions(system, scaling) {
    const { inventory, impacts } = lcia(system, scaling);
    const byProcess = zeros(system.methods.length, system.cols.length);
    for (let method = 0; method < system.methods.length; method += 1) {
      for (let col = 0; col < system.cols.length; col += 1) {
        let total = 0;
        for (let row = 0; row < system.elemKeys.length; row += 1) {
          total += system.Q[method][row] * system.B[row][col];
        }
        byProcess[method][col] = total * scaling[col];
      }
    }
    const byFlow = zeros(system.methods.length, system.elemKeys.length);
    for (let method = 0; method < system.methods.length; method += 1) {
      for (let row = 0; row < system.elemKeys.length; row += 1) {
        byFlow[method][row] = system.Q[method][row] * inventory[row];
      }
    }
    const byStage = {};
    for (const [columnId, stageId] of Object.entries(system.stageOfCol)) {
      const demand = new Float64Array(system.cols.length);
      demand[system.colIndex[columnId]] = 1;
      byStage[stageId] = lcia(system, solve(system, demand)).impacts;
    }
    return { impacts, inventory, byProcess, byStage, byFlow };
  }

  // Which columns emit one elementary flow, for one method: Q[k,i] B[i,j] s_j.
  // Sums over j to byFlow[k][i].
  function flowByProcess(system, scaling, method, row) {
    const factor = system.Q[method][row];
    return Float64Array.from(system.B[row], (amount, col) => factor * amount * scaling[col]);
  }

  // Impacts of one unit of a column's reference flow (e.g. 1 MJ of a grid mix),
  // with its whole upstream: solve A s = e_j, then Q B s.
  function unitImpacts(system, columnId) {
    const demand = new Float64Array(system.cols.length);
    demand[system.colIndex[columnId]] = 1;
    return lcia(system, solve(system, demand)).impacts;
  }

  function uncharacterisedFlows(system, inventory) {
    const result = [];
    system.elemKeys.forEach((key, row) => {
      let characterised = false;
      for (let method = 0; method < system.Q.length; method += 1) {
        if (system.Q[method][row] !== 0) characterised = true;
      }
      if (!characterised && inventory[row] !== 0) {
        const flow = system.bundle.flows[key.flow] || {};
        result.push({ row, flow: key.flow, name: flow.name, dir: key.dir, amount: inventory[row], unit: flow.unit });
      }
    });
    return result;
  }

  function foregroundMatrix(system) {
    const base = system.cols.filter((id) => system.colKind[id] !== "process");
    const direct = new Set();
    for (const key of system.aEntries.keys()) {
      const [rowId, colId] = key.split("\u0000");
      if (base.includes(colId) && !base.includes(rowId)) direct.add(rowId);
    }
    const ids = base.concat([...direct].sort((a, b) => system.colLabel[a].localeCompare(system.colLabel[b])));
    const indexes = ids.map((id) => system.colIndex[id]);
    return {
      ids,
      labels: ids.map((id) => system.colLabel[id]),
      matrix: indexes.map((row) => Float64Array.from(indexes, (col) => system.A[row][col])),
    };
  }

  return {
    buildSystem,
    solve,
    lcia,
    contributions,
    gaussianSolve,
    geoScore,
    flowByProcess,
    unitImpacts,
    uncharacterisedFlows,
    foregroundMatrix,
  };
});
