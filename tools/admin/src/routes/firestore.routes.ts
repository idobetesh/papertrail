import { Router } from 'express';
import { FirestoreController } from '../controllers/firestore.controller';

const BASE_PATH = '/firestore/collections';

export function createFirestoreRoutes(firestoreController: FirestoreController): Router {
  const router = Router();

  router.get(BASE_PATH, firestoreController.listCollections);

  // Specific routes before parameterized ones to avoid conflicts
  router.post(
    `${BASE_PATH}/:collectionName/delete-multiple`,
    firestoreController.deleteMultipleDocuments
  );
  router.get(`${BASE_PATH}/:collectionName/:documentId`, firestoreController.getDocument);
  router.put(`${BASE_PATH}/:collectionName/:documentId`, firestoreController.updateDocument);
  router.delete(`${BASE_PATH}/:collectionName/:documentId`, firestoreController.deleteDocument);
  router.get(`${BASE_PATH}/:collectionName`, firestoreController.listDocuments);

  return router;
}
