import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatDrawerMode } from '@angular/material/sidenav';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Subscription } from 'rxjs';

import { Header } from '../header/header';
import { AuthService } from '../../core/services/auth.service';
import { FileService } from '../../core/services/file.service';
import { FileDoc } from '../../core/models/file.models';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: 'queue';
}

type AppSection = 'admin' | 'teacher' | 'coard' | 'master';

const NAV_LINKS: Record<AppSection, NavItem[]> = {
  admin: [
    { label: 'Dashboard', icon: 'dashboard', route: '/admin/dashboard' },
    { label: 'Document', icon: 'description', route: '/admin/document', badge: 'queue' },
    { label: 'Account', icon: 'person_add', route: '/admin/account' },
  ],
  teacher: [
    { label: 'Home', icon: 'home', route: '/teacher/home' },
    { label: 'Profile', icon: 'person', route: '/profile' },
    { label: 'Documents', icon: 'description', route: '/teacher/documents', badge: 'queue' },
    { label: 'Upload', icon: 'upload_file', route: '/teacher/upload' },
  ],
  coard: [
    { label: 'Dashboard', icon: 'dashboard', route: '/coard/dashboard' },
    { label: 'Profile', icon: 'person', route: '/profile' },
    { label: 'Document', icon: 'description', route: '/coard/document', badge: 'queue' },
    { label: 'History', icon: 'history', route: '/coard/history' },
  ],
  master: [
    { label: 'Dashboard', icon: 'dashboard', route: '/master/dashboard' },
    { label: 'Profile', icon: 'person', route: '/profile' },
    { label: 'Document', icon: 'description', route: '/master/document', badge: 'queue' },
    { label: 'History', icon: 'history', route: '/master/history' },
  ],
};

@Component({
  selector: 'app-sidenav',
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    Header,
  ],
  templateUrl: './sidenav.html',
  styleUrl: './sidenav.css',
})
export class Sidenav implements OnInit, OnDestroy {
  private readonly mobileLikeBreakpoint = '(max-width: 1024px)';
  private readonly subscriptions = new Subscription();
  private isMobile = false;

  get isMobileView(): boolean {
    return this.isMobile;
  }

  currentSection: AppSection = 'admin';
  shouldRun = false;

  /** Desktop starts open; phones/tablets use overlay closed until the menu button. */
  opened = true;
  drawerMode: MatDrawerMode = 'side';
  fixedInViewport = false;
  fixedTopGap = 0;
  fixedBottomGap = 0;
  readonly queueCount = signal(0);

  @ViewChild('sidenav') sidenav!: MatSidenav;

  private readonly auth = inject(AuthService);
  private readonly fileService = inject(FileService);

  constructor(
    public router: Router,
    private dialog: MatDialog,
    private breakpointObserver: BreakpointObserver,
  ) {
    const initialIsMobile =
      typeof window !== 'undefined' && window.matchMedia(this.mobileLikeBreakpoint).matches;

    if (initialIsMobile) {
      this.isMobile = true;
      this.drawerMode = 'over';
      this.opened = false;
      this.fixedInViewport = true;
      this.fixedTopGap = 0;
    }

    this.updateSectionFromUrl(this.router.url);
  }

  ngOnInit(): void {
    this.refreshQueueBadge();

    this.subscriptions.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          this.updateSectionFromUrl(event.urlAfterRedirects);
          this.refreshQueueBadge();

          if (this.isMobile && this.sidenav?.opened) {
            void this.sidenav.close();
          }
        }),
    );

    this.subscriptions.add(
      this.breakpointObserver.observe([this.mobileLikeBreakpoint]).subscribe((result) => {
        this.isMobile = result.matches;

        if (this.isMobile) {
          this.drawerMode = 'over';
          this.opened = false;
          this.fixedInViewport = true;
          this.fixedTopGap = 0;
          return;
        }

        this.drawerMode = 'side';
        this.opened = true;
        this.fixedInViewport = false;
        this.fixedTopGap = 0;
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get navLinks(): NavItem[] {
    return NAV_LINKS[this.currentSection];
  }

  get sectionLabel(): string {
    switch (this.currentSection) {
      case 'admin':
        return 'Principal';
      case 'teacher':
        return 'Teacher';
      case 'coard':
        return 'Coord';
      case 'master':
        return 'Master';
      default:
        return '';
    }
  }

  toggleSidenav(): void {
    if (this.sidenav) {
      void this.sidenav.toggle();
      return;
    }
    this.opened = !this.opened;
  }

  badgeFor(item: NavItem): number {
    return item.badge === 'queue' ? this.queueCount() : 0;
  }

  badgeTitle(item: NavItem): string {
    const n = this.badgeFor(item);
    if (n <= 0) return '';
    if (this.currentSection === 'teacher') {
      return n === 1
        ? '1 document still in review'
        : `${n} documents still in review`;
    }
    return n === 1
      ? '1 document awaiting your review'
      : `${n} documents awaiting your review`;
  }

  private refreshQueueBadge(): void {
    if (!this.shouldRun) {
      this.queueCount.set(0);
      return;
    }

    const mine = this.currentSection === 'teacher';
    this.fileService.list(mine ? { mine: true } : {}).subscribe({
      next: (res) => this.queueCount.set(this.countQueue(res.files)),
      error: () => this.queueCount.set(0),
    });
  }

  private countQueue(files: FileDoc[]): number {
    switch (this.currentSection) {
      case 'admin':
        return files.filter(
          (f) =>
            (f.status === 'reviewed_by_master' && f.current_level === 4) ||
            f.status === 'exam_principal',
        ).length;
      case 'coard':
        return files.filter((f) => f.status === 'uploaded').length;
      case 'master':
        return files.filter((f) => f.current_level === 3 && f.status !== 'finalized').length;
      case 'teacher':
        return files.filter((f) => f.status !== 'finalized').length;
      default:
        return 0;
    }
  }

  logout(): void {
    const openDialog = () =>
      this.dialog.open(LogoutConfirmationDialog, {
        width: '380px',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: 'first-tabbable',
        panelClass: 'logout-dialog',
        backdropClass: 'logout-dialog-backdrop',
      });

    const dialogRef$ =
      this.isMobile && this.sidenav?.opened
        ? this.sidenav.close().then(() => openDialog())
        : Promise.resolve(openDialog());

    void dialogRef$.then((dialogRef) => {
      dialogRef.afterClosed().subscribe((confirmed) => {
        if (!confirmed) return;
        // Wait for the backend to invalidate the JWT (token_version bump)
        // before navigating, so this device cannot keep using the old token
        // even for an instant. logout() always resolves successfully.
        this.auth.logout().subscribe(() => {
          this.router.navigate(['/login']);
        });
      });
    });
  }

  private updateSectionFromUrl(url: string): void {
    const path = url.split('?')[0].split('#')[0];
    const isProfileStandalone = path === '/profile';
    const isAdminSection = path.startsWith('/admin');
    const isTeacherSection = path.startsWith('/teacher');
    const isCoardSection = path.startsWith('/coard');
    const isMasterSection = path.startsWith('/master');
    const isLoginPage = path.endsWith('/login');

    if (isProfileStandalone && !isLoginPage) {
      const level = Number(this.auth.roleLevel() ?? 0);
      if (level === 1) this.currentSection = 'teacher';
      else if (level === 2) this.currentSection = 'coard';
      else if (level === 3) this.currentSection = 'master';
      this.shouldRun = level >= 1 && level <= 3;
      return;
    }

    if (isTeacherSection) {
      this.currentSection = 'teacher';
    } else if (isCoardSection) {
      this.currentSection = 'coard';
    } else if (isMasterSection) {
      this.currentSection = 'master';
    } else if (isAdminSection) {
      this.currentSection = 'admin';
    }

    this.shouldRun = (isAdminSection || isTeacherSection || isCoardSection || isMasterSection) && !isLoginPage;
  }
}

@Component({
  selector: 'logout-confirmation-dialog',
  template: `
    <div class="logout-dialog-card">
      <div class="logout-dialog-icon" aria-hidden="true">
        <mat-icon fontSet="material-icons-outlined">logout</mat-icon>
      </div>
      <h2 class="logout-dialog-title">Log out?</h2>
      <p class="logout-dialog-copy">You’ll be signed out of this device. You can sign back in anytime.</p>
      <div class="logout-dialog-actions">
        <button type="button" class="logout-btn logout-btn-ghost" [mat-dialog-close]="false">Cancel</button>
        <button type="button" class="logout-btn logout-btn-solid" [mat-dialog-close]="true">Log out</button>
      </div>
    </div>
  `,
  styles: [
    `
      .logout-dialog-card {
        padding: 28px 24px 22px;
        text-align: center;
      }

      .logout-dialog-icon {
        align-items: center;
        background: rgba(58, 140, 142, 0.12);
        border-radius: 16px;
        color: #3a8c8e;
        display: inline-flex;
        height: 52px;
        justify-content: center;
        margin-bottom: 16px;
        width: 52px;
      }

      .logout-dialog-icon mat-icon {
        font-size: 26px;
        height: 26px;
        width: 26px;
      }

      .logout-dialog-title {
        color: #1f2a2e;
        font-size: 1.25rem;
        font-weight: 600;
        letter-spacing: -0.02em;
        line-height: 1.3;
        margin: 0 0 8px;
      }

      .logout-dialog-copy {
        color: #5b6b70;
        font-size: 0.9rem;
        line-height: 1.5;
        margin: 0 0 22px;
      }

      .logout-dialog-actions {
        display: grid;
        gap: 10px;
        grid-template-columns: 1fr 1fr;
      }

      .logout-btn {
        border: 0;
        border-radius: 12px;
        cursor: pointer;
        font-family: inherit;
        font-size: 0.92rem;
        font-weight: 600;
        height: 44px;
        padding: 0 12px;
      }

      .logout-btn-ghost {
        background: #eef3f4;
        color: #3d4d52;
      }

      .logout-btn-ghost:hover {
        background: #e4ebed;
      }

      .logout-btn-solid {
        background: #3a8c8e;
        color: #fff;
      }

      .logout-btn-solid:hover {
        background: #32787a;
      }
    `,
  ],
  standalone: true,
  imports: [MatDialogModule, MatIconModule],
})
export class LogoutConfirmationDialog {}

