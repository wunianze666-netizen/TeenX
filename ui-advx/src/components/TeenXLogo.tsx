type TeenXLogoProps = {
  readonly alt: "" | "TeenX";
  readonly loading?: "eager" | "lazy";
};

export function TeenXLogo({ alt, loading = "eager" }: TeenXLogoProps) {
  return (
    <img
      className="teenx-logo"
      src="/teenx-logo.webp"
      width={512}
      height={512}
      alt={alt}
      loading={loading}
      decoding="async"
    />
  );
}
