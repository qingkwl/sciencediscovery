import type { ConfigurationChoiceOptionView, ConfigurationChoiceReceipt } from "@sciencediscovery/schema";
import type { ConfigurationPlan, ConfigurationRecord } from "./types.js";
/** Finite, server-owned choices. Candidate text/commands supplied by the Agent are never accepted. */
export declare function normalizeChoices(raw: ConfigurationChoiceOptionView[]): ConfigurationChoiceOptionView[];
export declare function defaultChoices(): ConfigurationChoiceOptionView[];
export declare function selectedChoice(record: ConfigurationRecord): ConfigurationChoiceOptionView | undefined;
export declare function choosePlan(plan: ConfigurationPlan, option: ConfigurationChoiceOptionView): ConfigurationPlan;
export declare function makeChoiceReceipt(record: ConfigurationRecord): ConfigurationChoiceReceipt | undefined;
export declare function projectChoiceReceipt(receipt: ConfigurationChoiceReceipt): ConfigurationChoiceReceipt;
