import { useFetcher, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  Badge,
  BlockStack,
  Card,
  Checkbox,
  FormLayout,
  InlineStack,
  Page,
  Select,
  Text,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import {
  ensureMetafieldDefinitions,
  getShopSettings,
  saveShopSettings,
} from "../models/variant-images.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  await ensureMetafieldDefinitions(admin);
  const { settings } = await getShopSettings(admin);

  return { settings };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const enabled = formData.get("enabled") === "true";
  const allowSharedImages = formData.get("allowSharedImages") === "true";
  const hideUnassignedImages = formData.get("hideUnassignedImages") === "true";

  const { shopId } = await getShopSettings(admin);
  const saved = await saveShopSettings(admin, shopId, {
    enabled,
    allowSharedImages,
    hideUnassignedImages,
  });

  return json({ ok: true, settings: saved });
};

export default function SettingsPage() {
  const { settings: initialSettings } = useLoaderData();
  const fetcher = useFetcher();

  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [allowSharedImages, setAllowSharedImages] = useState(initialSettings.allowSharedImages);
  const [hideUnassignedImages, setHideUnassignedImages] = useState(initialSettings.hideUnassignedImages);

  const isSaving = fetcher.state !== "idle";

  return (
    <Page
      title="Settings"
      subtitle="Configure how variant images work on your storefront"
      backAction={{ content: "Overview", url: "/app" }}
      primaryAction={{
        content: isSaving ? "Saving..." : "Save",
        disabled: isSaving,
        onAction: () => {
          fetcher.submit(
            {
              enabled: String(enabled),
              allowSharedImages: String(allowSharedImages),
              hideUnassignedImages: String(hideUnassignedImages),
            },
            { method: "post" },
          );
        },
      }}
    >
      <TitleBar title="Settings" />

      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Variant images status
              </Text>
              <Badge tone={enabled ? "success" : "critical"}>{enabled ? "Active" : "Disabled"}</Badge>
            </InlineStack>

            <Checkbox
              label="Enable variant images on storefront"
              checked={enabled}
              onChange={setEnabled}
            />
            <Text as="p" tone="subdued">
              Disable this to temporarily show your theme's default image behavior.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <FormLayout>
            <Select
              label="Allow assigning the same image to multiple variants"
              options={[
                { label: "Yes", value: "true" },
                { label: "No", value: "false" },
              ]}
              value={String(allowSharedImages)}
              onChange={(value) => setAllowSharedImages(value === "true")}
            />
            <Text as="p" tone="subdued">
              Default is Yes. If No, assigning an image to one variant removes it from other variants.
            </Text>
          </FormLayout>
        </Card>

        <Card>
          <FormLayout>
            <Select
              label="Hide unassigned images on storefront"
              options={[
                { label: "No", value: "false" },
                { label: "Yes", value: "true" },
              ]}
              value={String(hideUnassignedImages)}
              onChange={(value) => setHideUnassignedImages(value === "true")}
            />
            <Text as="p" tone="subdued">
              Default is No. This controls whether images not assigned to any variant remain visible.
            </Text>
          </FormLayout>
        </Card>

        {fetcher.data?.ok ? (
          <Card>
            <Text as="p" tone="success">
              Settings saved.
            </Text>
          </Card>
        ) : null}
      </BlockStack>
    </Page>
  );
}
