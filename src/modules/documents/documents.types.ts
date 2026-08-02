export type DocumentModule = "Projects" | "Customers";

export type DocumentListQuery = {
  page?: number | string;
  limit?: number | string;
  search?: string;
  module?: DocumentModule;
};

export type DocumentRow = {
  id: string;
  name: string;
  category: string;
  module: DocumentModule;
  relatedName: string;
  fileUrl: string;
  status: string;
  uploadedAt: Date;
};
