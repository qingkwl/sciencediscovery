// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
// Licensed under the Apache License, Version 2.0 (the "License");
import { RuntimeBuilder, } from "@sciencediscovery/runtime-core";
/** API composition root: adapters are registered here, not looked up by the core. */
export function composeRuntime(composition) {
    return new RuntimeBuilder()
        .withContextAssembler(composition.contextAssembler)
        .withModelClient(composition.modelClient)
        .withToolDispatcher(composition.toolDispatcher)
        .withEventSink(composition.eventSink)
        .withWaitController(composition.waitController)
        .withTurnLifecycle(composition.turnLifecycle)
        .withOutputRecovery(composition.outputRecovery)
        .withSuspendAfterTurn(composition.suspendAfterTurn)
        .withAccumulateUsage(composition.accumulateUsage)
        .withMaxModelTurns(composition.maxModelTurns)
        .withMaxParallelToolCalls(composition.maxParallelToolCalls)
        .build();
}
