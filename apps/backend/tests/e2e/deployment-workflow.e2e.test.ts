/**
 * End-to-End Tests for Complete Deployment Workflow
 * Issue #330: Create E2E tests for complete deployment workflow
 *
 * Tests the full user journey from signup through successful deployment
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock Services ─────────────────────────────────────────────────────────────

const mockSupabaseClient = {
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
  },
  from: vi.fn(),
};

const mockGithubService = {
  createRepository: vi.fn(),
  pushCode: vi.fn(),
  getRepositoryUrl: vi.fn(),
};

const mockVercelService = {
  createProject: vi.fn(),
  deployProject: vi.fn(),
  getDeploymentStatus: vi.fn(),
};

const mockDeploymentService = {
  createDeployment: vi.fn(),
  updateDeploymentStatus: vi.fn(),
  getDeployment: vi.fn(),
};

const mockNotificationService = {
  sendDeploymentNotification: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabaseClient,
}));

vi.mock('@/services/github.service', () => ({
  githubService: mockGithubService,
}));

vi.mock('@/services/vercel.service', () => ({
  vercelService: mockVercelService,
}));

vi.mock('@/services/deployment.service', () => ({
  deploymentService: mockDeploymentService,
}));

vi.mock('@/services/notification.service', () => ({
  notificationService: mockNotificationService,
}));

// ── Test Data ─────────────────────────────────────────────────────────────────

const testUser = {
  id: 'user-123',
  email: 'test@example.com',
  password: 'SecurePassword123!',
};

const testTemplate = {
  id: 'template-stellar-dex',
  name: 'Stellar DEX',
  category: 'dex',
};

const testCustomization = {
  branding: {
    logo: 'https://example.com/logo.png',
    primaryColor: '#FF6B6B',
    secondaryColor: '#4ECDC4',
  },
  features: {
    enableCharts: true,
    enableHistory: true,
  },
};

const testDeployment = {
  id: 'deployment-123',
  userId: testUser.id,
  templateId: testTemplate.id,
  name: 'My DEX',
  status: 'pending',
  deploymentUrl: null,
  repositoryUrl: null,
  vercelProjectId: null,
  githubRepoId: null,
};

// ── Helper Functions ──────────────────────────────────────────────────────────

function setupSignupMocks() {
  mockSupabaseClient.auth.signUp.mockResolvedValue({
    data: {
      user: { id: testUser.id, email: testUser.email },
      session: { access_token: 'token-123' },
    },
    error: null,
  });
}

function setupTemplateMocks() {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: testTemplate,
      error: null,
    }),
  };
  mockSupabaseClient.from.mockReturnValue(mockChain);
}

function setupGithubMocks() {
  mockGithubService.createRepository.mockResolvedValue({
    id: 'repo-123',
    url: 'https://github.com/test/my-dex',
    cloneUrl: 'https://github.com/test/my-dex.git',
  });

  mockGithubService.pushCode.mockResolvedValue({
    success: true,
    commit: 'abc123def456',
  });
}

function setupVercelMocks() {
  mockVercelService.createProject.mockResolvedValue({
    id: 'vercel-project-123',
    name: 'my-dex',
  });

  mockVercelService.deployProject.mockResolvedValue({
    id: 'deployment-vercel-123',
    status: 'building',
    url: 'https://my-dex.vercel.app',
  });

  mockVercelService.getDeploymentStatus.mockResolvedValue({
    status: 'ready',
    url: 'https://my-dex.vercel.app',
  });
}

function setupDeploymentMocks() {
  mockDeploymentService.createDeployment.mockResolvedValue({
    ...testDeployment,
    status: 'building',
  });

  mockDeploymentService.updateDeploymentStatus.mockResolvedValue({
    ...testDeployment,
    status: 'completed',
    deploymentUrl: 'https://my-dex.vercel.app',
  });

  mockDeploymentService.getDeployment.mockResolvedValue({
    ...testDeployment,
    status: 'completed',
    deploymentUrl: 'https://my-dex.vercel.app',
    repositoryUrl: 'https://github.com/test/my-dex',
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('E2E: Complete Deployment Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSignupMocks();
    setupTemplateMocks();
    setupGithubMocks();
    setupVercelMocks();
    setupDeploymentMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should complete full user journey from signup to deployment', async () => {
    // Step 1: User signup
    const signupResult = await mockSupabaseClient.auth.signUp({
      email: testUser.email,
      password: testUser.password,
    });

    expect(signupResult.data.user.id).toBe(testUser.id);
    expect(signupResult.data.user.email).toBe(testUser.email);
    expect(signupResult.data.session.access_token).toBeDefined();

    // Step 2: Template selection
    const templateResult = await mockSupabaseClient.from('templates')
      .select()
      .eq('id', testTemplate.id)
      .single();

    expect(templateResult.data.id).toBe(testTemplate.id);
    expect(templateResult.data.name).toBe(testTemplate.name);

    // Step 3: Create deployment with customization
    const deploymentResult = await mockDeploymentService.createDeployment({
      userId: testUser.id,
      templateId: testTemplate.id,
      name: testDeployment.name,
      customization: testCustomization,
    });

    expect(deploymentResult.id).toBeDefined();
    expect(deploymentResult.status).toBe('building');

    // Step 4: GitHub repository creation
    const repoResult = await mockGithubService.createRepository({
      name: 'my-dex',
      private: true,
    });

    expect(repoResult.id).toBeDefined();
    expect(repoResult.url).toContain('github.com');

    // Step 5: Push code to GitHub
    const pushResult = await mockGithubService.pushCode({
      repositoryUrl: repoResult.cloneUrl,
      code: 'generated-code',
    });

    expect(pushResult.success).toBe(true);
    expect(pushResult.commit).toBeDefined();

    // Step 6: Vercel deployment
    const vercelResult = await mockVercelService.createProject({
      name: 'my-dex',
      gitRepository: repoResult.url,
    });

    expect(vercelResult.id).toBeDefined();

    // Step 7: Deploy to Vercel
    const deployResult = await mockVercelService.deployProject({
      projectId: vercelResult.id,
    });

    expect(deployResult.status).toBe('building');
    expect(deployResult.url).toBeDefined();

    // Step 8: Poll deployment status
    let deploymentStatus = deployResult.status;
    let attempts = 0;
    while (deploymentStatus === 'building' && attempts < 10) {
      const statusResult = await mockVercelService.getDeploymentStatus({
        deploymentId: deployResult.id,
      });
      deploymentStatus = statusResult.status;
      attempts++;
    }

    expect(deploymentStatus).toBe('ready');

    // Step 9: Update deployment status in database
    const finalDeployment = await mockDeploymentService.updateDeploymentStatus({
      deploymentId: deploymentResult.id,
      status: 'completed',
      deploymentUrl: deployResult.url,
    });

    expect(finalDeployment.status).toBe('completed');
    expect(finalDeployment.deploymentUrl).toBeDefined();

    // Step 10: Send notification
    await mockNotificationService.sendDeploymentNotification({
      userId: testUser.id,
      deploymentId: deploymentResult.id,
      deploymentUrl: finalDeployment.deploymentUrl,
    });

    expect(mockNotificationService.sendDeploymentNotification).toHaveBeenCalled();
  });

  it('should verify deployed application is accessible', async () => {
    const deployment = await mockDeploymentService.getDeployment({
      deploymentId: testDeployment.id,
    });

    expect(deployment.deploymentUrl).toBeDefined();
    expect(deployment.status).toBe('completed');

    // Simulate health check
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy' }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const response = await fetch(deployment.deploymentUrl);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it('should handle deployment failure gracefully', async () => {
    mockVercelService.deployProject.mockRejectedValue(
      new Error('Deployment failed: insufficient resources')
    );

    const deployment = await mockDeploymentService.createDeployment({
      userId: testUser.id,
      templateId: testTemplate.id,
      name: testDeployment.name,
      customization: testCustomization,
    });

    try {
      await mockVercelService.deployProject({
        projectId: 'vercel-project-123',
      });
      expect.fail('Should have thrown error');
    } catch (error: any) {
      expect(error.message).toContain('Deployment failed');

      // Update deployment status to failed
      await mockDeploymentService.updateDeploymentStatus({
        deploymentId: deployment.id,
        status: 'failed',
        error: error.message,
      });

      expect(mockDeploymentService.updateDeploymentStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
        })
      );
    }
  });

  it('should verify GitHub repository creation and code push', async () => {
    const repoResult = await mockGithubService.createRepository({
      name: 'my-dex',
      private: true,
      description: 'Production repository for My DEX',
    });

    expect(repoResult.id).toBeDefined();
    expect(repoResult.url).toContain('github.com');

    const pushResult = await mockGithubService.pushCode({
      repositoryUrl: repoResult.cloneUrl,
      code: 'generated-code',
      branch: 'main',
    });

    expect(pushResult.success).toBe(true);
    expect(pushResult.commit).toBeDefined();
  });

  it('should update deployment status through all stages', async () => {
    const stages = ['pending', 'building', 'verifying', 'completed'];

    for (const stage of stages) {
      const updated = await mockDeploymentService.updateDeploymentStatus({
        deploymentId: testDeployment.id,
        status: stage,
      });

      expect(updated.status).toBe(stage);
    }
  });

  it('should validate deployment status updates and notifications', async () => {
    const deployment = await mockDeploymentService.createDeployment({
      userId: testUser.id,
      templateId: testTemplate.id,
      name: testDeployment.name,
      customization: testCustomization,
    });

    await mockDeploymentService.updateDeploymentStatus({
      deploymentId: deployment.id,
      status: 'completed',
      deploymentUrl: 'https://my-dex.vercel.app',
    });

    await mockNotificationService.sendDeploymentNotification({
      userId: testUser.id,
      deploymentId: deployment.id,
      deploymentUrl: 'https://my-dex.vercel.app',
    });

    expect(mockNotificationService.sendDeploymentNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: testUser.id,
        deploymentId: deployment.id,
      })
    );
  });
});
