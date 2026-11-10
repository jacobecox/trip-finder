export const TAGS = ["beach", "theme_park", "hiking", "skiing", "kid_friendly"] as const;
export type Tag = (typeof TAGS)[number];

export type TagWeights = Record<Tag, number>;
export const DEFAULT_TAG_WEIGHTS: TagWeights = { kid_friendly: 3, beach: 2, theme_park: 2, hiking: 1, skiing: 1 };

export const TAG_LABELS: Record<Tag, string> = {
  beach: "Beach",
  theme_park: "Theme parks",
  hiking: "Hiking",
  skiing: "Skiing",
  kid_friendly: "Kid-friendly",
};
