import React, { useState } from 'react';
import { Form } from 'react-bootstrap';
import apiService from '../services/api';
import './CollectionRenameDialog.css';
import Button from './shared/Button';
import Dialog from './shared/Dialog';

interface CollectionRenameDialogProps {
  show: boolean;
  onHide: () => void;
  oldName: string;
  newName: string;
  onConfirm: (action: string) => void;
}

const CollectionRenameDialog = ({
  show,
  onHide,
  oldName,
  newName,
  onConfirm
}: CollectionRenameDialogProps) => {
  const [action, setAction] = useState<string>('create'); // 'create' or 'rename'
  const [loading, setLoading] = useState<boolean>(false);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await apiService.handleCollectionNameChange(oldName, newName, action);
      onConfirm(action);
      onHide();
    } catch (error) {
      console.error('Error handling collection name change:', error);
      // You might want to show an error message to the user here
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setAction('create'); // Reset to default
    onHide();
  };

  return (
    <Dialog show={show} onClose={handleCancel} title="Collection Name Change">
      <Dialog.Body>
        <p>
          The collection name has changed from <strong>"{oldName}"</strong> to <strong>"{newName}"</strong>.
        </p>
        <p>How would you like to handle this change?</p>

        <Form>
          <Form.Check
            type="radio"
            id="create-new"
            name="action"
            value="create"
            checked={action === 'create'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAction(e.target.value)}
            label={
              <div>
                <strong>Create new collection</strong>
                <div className="action-description">
                  Keep the existing "{oldName}" collection and create a new "{newName}" collection.
                  Movies will be moved to the new collection.
                </div>
              </div>
            }
          />

          <Form.Check
            type="radio"
            id="rename-existing"
            name="action"
            value="rename"
            checked={action === 'rename'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAction(e.target.value)}
            label={
              <div>
                <strong>Rename existing collection</strong>
                <div className="action-description">
                  Rename the "{oldName}" collection to "{newName}".
                  All movies in the collection will be updated.
                </div>
              </div>
            }
          />
        </Form>
      </Dialog.Body>
      <Dialog.Footer>
        <Button variant="quiet" onClick={handleCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant="primary"
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Confirm'}
        </Button>
      </Dialog.Footer>
    </Dialog>
  );
};

export default CollectionRenameDialog;
