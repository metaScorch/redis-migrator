import Image from 'next/image';

interface AuthLayoutProps {
  children: React.ReactNode;
  heading: string;
  subheading: string;
}

export function AuthLayout({ children, heading, subheading }: AuthLayoutProps) {
  return (
    <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white lg:flex dark:border-r">
        <div className="absolute inset-0 bg-red-600" />
        <div className="relative z-20 flex items-center gap-2">
          <Image 
            src="/images/redswish-logo.png" 
            alt="RedSwish Logo" 
            width={32} 
            height={32}
          />
          <h1 className="text-lg font-medium">RedZwitch</h1>
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              "The most reliable Redis migration tool I've ever used. The real-time synchronization feature is a game changer."
            </p>
            <footer className="text-sm">Sofia Davis, Database Engineer</footer>
          </blockquote>
        </div>
      </div>
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
            <p className="text-sm text-muted-foreground">{subheading}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}