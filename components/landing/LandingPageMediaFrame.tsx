'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  aspectRatio: number;
  src: string;
  title: string;
}

function fitBox(
  containerWidth: number,
  containerHeight: number,
  aspectRatio: number
): { width: number; height: number } {
  if (containerWidth <= 0 || containerHeight <= 0 || aspectRatio <= 0) {
    return { width: 0, height: 0 };
  }

  const containerRatio = containerWidth / containerHeight;
  if (containerRatio > aspectRatio) {
    const height = containerHeight;
    return { width: height * aspectRatio, height };
  }

  const width = containerWidth;
  return { width, height: width / aspectRatio };
}

export default function LandingPageMediaFrame({
  aspectRatio,
  src,
  title,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setSize(fitBox(rect.width, rect.height, aspectRatio));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [aspectRatio]);

  return (
    <div
      ref={containerRef}
      className="landing-page-media-fit"
    >
      <div
        className="landing-page-media-frame"
        style={{
          width: size.width > 0 ? `${size.width}px` : '100%',
          height: size.height > 0 ? `${size.height}px` : '100%',
        }}
      >
        <iframe
          src={src}
          title={title}
          className="landing-page-media-iframe"
        />
      </div>
    </div>
  );
}
