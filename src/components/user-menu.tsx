import { useState } from 'react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from 'lucide-react';

interface UserMenuProps {
  user: {
    email: string;
    user_metadata: {
      full_name: string;
    };
  } | null;
  onSignOut: () => void;
}

export function UserMenu({ user, onSignOut }: UserMenuProps) {
  if (!user) return null;

  const displayName = user.user_metadata?.full_name || user.email.split('@')[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 hover:text-red-600">
        <span className="font-medium">{displayName}</span>
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuItem className="flex items-center justify-between">
          <span className="text-sm text-gray-500 truncate">{user.email}</span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account">My Account</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSignOut}>
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}