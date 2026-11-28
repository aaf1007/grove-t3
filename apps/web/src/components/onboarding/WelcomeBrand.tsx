import mascot from "../../../../../assets/loopy/illustrated/mascot.webp";

export function WelcomeMascot() {
  return (
    <img
      src={mascot}
      alt=""
      width={480}
      height={330}
      decoding="async"
      className="mb-4 h-auto w-28 sm:w-36"
    />
  );
}
