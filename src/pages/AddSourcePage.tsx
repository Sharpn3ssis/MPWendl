import React from 'react';
import { NewSourceForm } from '../components/NewSourceForm';
import { useNavigate } from 'react-router-dom';

export const AddSourcePage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="add-source-page">
      <NewSourceForm onAdded={() => navigate('/dashboard')} />
    </div>
  );
};
