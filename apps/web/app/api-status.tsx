'use client';

import { HealthResponse } from '@mvp/shared';
import { useEffect, useState } from 'react';

// Fetched from the browser so it goes through the same-origin /api proxy.
export function ApiStatus() {
  const [text, setText] = useState('Checking API…');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body) => {
        const health = HealthResponse.parse(body);
        setText(`API ${health.status}: database ${health.database}, redis ${health.redis}`);
      })
      .catch(() => setText('API unreachable'));
  }, []);

  return <p role="status">{text}</p>;
}
