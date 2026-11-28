// Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
const EMPTY_CATALOG = {
    loadedAt: "2026-01-01T00:00:00.000Z",
    revision: "api-fixture-empty",
    servers: [],
};
/** No servers, and invoking fails closed so an accidental dependency is loud. */
export const offlineMcpTransport = {
    catalog: async () => EMPTY_CATALOG,
    reload: async () => EMPTY_CATALOG,
    invoke: async () => { throw new Error("This API fixture must explicitly provide an MCP transport before invoking MCP"); },
};
