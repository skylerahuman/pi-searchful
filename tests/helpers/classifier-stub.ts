/**
 * Test helper: a stub ModelRegistry that returns canned classify() decisions.
 *
 * Usage:
 *   const reg = classifierFromCanned({ provider: "brave" });
 *   await dispatchSearch(params, signal, { modelRegistry: reg });
 */

import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

export type CannedDecision = {
	provider?: "exa" | "brave" | "tavily";
};

/**
 * Build a registry whose findOfType() returns a model descriptor, and whose
 * classify() returns the canned provider choice.
 */
export function classifierFromCanned(decision: CannedDecision | undefined): ModelRegistry {
	const model = {
		provider: "typesafe",
		id: "jev-latest",
		api: "typesafe-system-one",
	};
	const reg = {
		findOfType: (type: string, provider: string, id: string) => {
			if (type !== "classifier") return undefined;
			if (provider === "typesafe" && id === "jev-latest") return model;
			return undefined;
		},
		find: (provider: string, id?: string) => {
			// Pretend OpenAI is registered so providers that probe it don't crash.
			if (provider === "openai-codex") return { provider, id };
			return undefined;
		},
		async classify(jevModel: unknown, request: unknown) {
			if (!decision || !decision.provider) {
				throw new Error("classifier not configured in test");
			}
			const choice = decision.provider;
			const answers = {
				provider: {
					type: "choice" as const,
					choice,
					probabilities: { [choice]: 0.9 },
				},
			};
			void jevModel;
			void request;
			return { answers };
		},
	};
	return reg as unknown as ModelRegistry;
}

export function resetClassifierOverrides() {
	/* no global state to reset */
}
