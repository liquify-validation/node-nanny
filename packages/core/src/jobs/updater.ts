import axios from "axios";
import { connect, disconnect } from "../db";
import { ChainsModel, OraclesModel, IChain, IOracle, WebhookModel } from "../models";
import { getTimestamp } from "../utils";
import { DiscordService } from "../services";

interface IChainsAndOraclesResponse {
  chains: IChain[];
  oracles: IOracle[];
}

/* ----- Script Runs Every Hour ----- */
(async () => {
  await connect();

  /* ---- 1) Add Frontend Alert Webhook if Doesn't Exist ---- */
  if (!(await WebhookModel.exists({ chain: "FRONTEND_ALERT" }))) {
    await new DiscordService().addWebhookForFrontendNodes();
  }
  const {
    data: { chains, oracles },
  } = await axios.get<IChainsAndOraclesResponse>(
    "https://k69ggmt3u3.execute-api.us-east-2.amazonaws.com/update",
  );

  /* ---- 2) Sync Chains and Oracles from Node Nanny Internal DB ---- */
  console.log(
    `Running updater at ${getTimestamp()}.\nChecking ${chains.length} chains and ${
      oracles.length
    } oracles ...`,
  );

  const existingChains = (await ChainsModel.find()).map(({ name }) => name);

  for await (const chain of chains) {
    const { name } = chain;

    try {
      if (!existingChains.includes(name)) {
        const chainInput = {
          type: chain.type,
          name: chain.name,
          allowance: chain.allowance,
        };
        await ChainsModel.create(chainInput);
      }
    } catch (error) {
      console.error(`Error updating Chains. Chain: ${name} ${error}`);
      continue;
    }
  }

  const existingOracles = (await OraclesModel.find()).map(({ chain }) => chain);

  for await (const oracle of oracles) {
    const { chain } = oracle;

    try {
      if (!existingOracles.includes(chain)) {
        await OraclesModel.create(oracle);
      }
    } catch (error) {
      console.error(`Error updating Oracles. Chain: ${chain} ${error}`);
      continue;
    }
  }

  await disconnect();
})();
