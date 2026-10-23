import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type DiscoverPaginationProps = {
  currentPage: number;
  lastPage: number;
  onPageChange: (page: number) => void;
};

export function DiscoverPagination({ currentPage, lastPage, onPageChange }: DiscoverPaginationProps) {
  if (lastPage <= 1 && currentPage <= 1) return null;

  return <nav aria-label="Results pages" className="mx-auto grid w-full max-w-sm grid-cols-[2.75rem_2.75rem_minmax(0,1fr)_2.75rem_2.75rem] items-center gap-1 sm:gap-2">
    <Button aria-label="Go to first page" disabled={currentPage <= 1} onClick={() => onPageChange(1)} size="icon" title="Go to first page" variant="outline"><ChevronsLeft aria-hidden="true" /></Button>
    <Button aria-label="Previous page" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} size="icon" title="Previous page" variant="outline"><ChevronLeft aria-hidden="true" /></Button>
    <span className="min-w-0 text-center text-xs sm:text-sm">Page {currentPage}{lastPage >= currentPage ? ` of ${lastPage}` : ""}</span>
    <Button aria-label="Next page" disabled={currentPage >= lastPage} onClick={() => onPageChange(currentPage + 1)} size="icon" title="Next page" variant="outline"><ChevronRight aria-hidden="true" /></Button>
    <Button aria-label="Go to last page" disabled={lastPage < 1 || currentPage === lastPage} onClick={() => onPageChange(lastPage)} size="icon" title="Go to last page" variant="outline"><ChevronsRight aria-hidden="true" /></Button>
  </nav>;
}
