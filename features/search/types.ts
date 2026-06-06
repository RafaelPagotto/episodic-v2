export type AddShowActionResult = {
  message: string;
  status: "duplicate" | "error" | "success";
  tmdbId?: number;
};

export type SearchCardMessage = {
  message: string;
  status: "error" | "success";
};
