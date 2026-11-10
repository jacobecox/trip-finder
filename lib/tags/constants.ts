export const TAGS = ["beach", "theme_park", "zoo_aquarium", "hiking", "skiing", "scenic", "city"] as const;
export type Tag = (typeof TAGS)[number];

export type TagWeights = Record<Tag, number>;
export const DEFAULT_TAG_WEIGHTS: TagWeights = {
  beach: 2,
  theme_park: 2,
  zoo_aquarium: 2,
  hiking: 1,
  skiing: 1,
  scenic: 1,
  city: 0, // neutral by default; raise it to favor city trips
};

export const TAG_LABELS: Record<Tag, string> = {
  beach: "Beach",
  theme_park: "Theme parks",
  hiking: "Hiking",
  skiing: "Skiing",
  zoo_aquarium: "Zoo & aquarium",
  scenic: "Scenic",
  city: "City",
};

/** Display only; not stored. */
export const TAG_EMOJI: Record<Tag, string> = {
  beach: "🏖️",
  theme_park: "🎢",
  hiking: "🥾",
  skiing: "⛷️",
  zoo_aquarium: "🦁",
  scenic: "🏞️",
  city: "🏙️",
};

export const tagDisplay = (t: Tag) => `${TAG_EMOJI[t]} ${TAG_LABELS[t]}`;
