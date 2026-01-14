import { useEffect, useRef } from 'react';

interface InitializerProps {
  setPlugin: (id: string) => void;
}

const Initializer: React.FC<InitializerProps> = ({ setPlugin }) => {
  const ref = useRef(false);

  useEffect(() => {
    if (!ref.current) {
      setPlugin('maplibre-field');
      ref.current = true;
    }
  }, [setPlugin]);

  return null;
};

export default Initializer;
