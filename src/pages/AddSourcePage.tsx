import React from 'react';
import { NewSourceForm } from '../components/NewSourceForm';
import { useNavigate } from 'react-router-dom';

export const AddSourcePage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div style={{padding:20}}>
      <NewSourceForm onAdded={() => navigate('/dashboard')} />
    </div>
  );
};
