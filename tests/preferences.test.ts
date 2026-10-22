import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultsSchema, factoryDefaults, preferences, resolveDefaults } from "../shared/preferences";

test("new installations inherit host defaults and a workspace override stays isolated", () => {
  const values = preferences.schema.parse({});
  assert.deepEqual(resolveDefaults(values, "workspace-a"), factoryDefaults);
  values.defaults.options.includeTools = false;
  assert.equal(resolveDefaults(values, "workspace-b").options.includeTools, false);
  values.workspaces["workspace-a"] = {
    ...factoryDefaults, destination: "custom", directory: "~/Storage/Git/context/paseo/",
    options: { ...factoryDefaults.options, includeTools: false },
  };
  assert.equal(resolveDefaults(values, "workspace-a").directory, "~/Storage/Git/context/paseo/");
  assert.equal(resolveDefaults(values, "workspace-b").directory, "");
  delete values.workspaces["workspace-a"];
  assert.equal(resolveDefaults(values, "workspace-a").options.includeTools, false);
});
test("saved defaults reject invalid folders without rejecting clipboard exports", () => {
  assert.equal(defaultsSchema.safeParse({ ...factoryDefaults, destination: "custom", directory: "relative/path" }).success, false);
  assert.equal(defaultsSchema.safeParse({ ...factoryDefaults, destination: "custom", directory: "~/exports" }).success, true);
  assert.equal(defaultsSchema.safeParse({ ...factoryDefaults, destination: "clipboard" }).success, true);
});
