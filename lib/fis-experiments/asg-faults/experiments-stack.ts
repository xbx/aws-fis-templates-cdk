import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackProps, Stack } from 'aws-cdk-lib';
import { aws_fis as fis } from 'aws-cdk-lib'; 

export class AsgExperiments extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);


    // Import FIS Role and Stop Condition
    const importedFISRoleArn = cdk.Fn.importValue('FISIamRoleArn');
    const importedStopConditionArn = cdk.Fn.importValue('StopConditionArn');

    // Variables you may want to change based on your environment
    // const asgName = new cdk.CfnParameter(this, 'asgName', {
    //   type: 'String',
    //   description: 'The auto scaling group name in which to inject fault',
    //   default: 'Test-FIS-ASG',
    // });
    //console.log('asgName: ', asgName.valueAsString);
    
    // if asg_name parameter is in cdk.json us the below
    const asgName = this.node.tryGetContext('asg_name');
    console.log('asgName: ', asgName.toString());

    const availabilityZones = Stack.of(this).availabilityZones;
    console.log('availability zones: ', Stack.of(this).availabilityZones);
    const randomAvailabilityZone = availabilityZones[Math.floor(Math.random() * availabilityZones.length)];
    console.log('random availability zone: ', randomAvailabilityZone);
    // const randomAvailabilityZone = 'us-east-1a'


    // Targets
    const TargetAllInstancesASG: fis.CfnExperimentTemplate.ExperimentTemplateTargetProperty = {
      resourceType: 'aws:ec2:instance',
      selectionMode: 'ALL',
      resourceTags: {
        'aws:autoscaling:groupName': asgName.toString()
      },
      filters:  [
          {
            path:'State.Name',
            values: [ 'running' ]
          }
        ]
    }

    const TargetAllInstancesASGAZ: fis.CfnExperimentTemplate.ExperimentTemplateTargetProperty = {
      resourceType: 'aws:ec2:instance',
      selectionMode: 'ALL',
      resourceTags: {
        'aws:autoscaling:groupName': asgName.toString()
      },
      filters:  [
          {
            path:'State.Name',
            values: [ 'running' ]
          },
          {
            path:'Placement.AvailabilityZone',
            values: [ randomAvailabilityZone ]
          },
        ]
    }

    // Actions
    const stopInstanceAction: fis.CfnExperimentTemplate.ExperimentTemplateActionProperty = {
      actionId: 'aws:ec2:terminate-instances',
      parameters: { },
      targets: { 
        Instances: 'instanceTargets'
      }
    }

    // Actions
    const cpuStressAction = {
      actionId: 'aws:ssm:send-command',
      description: 'CPU stress via SSM',
      parameters: {
        documentArn: `arn:aws:ssm:${this.region}::document/AWSFIS-Run-CPU-Stress`,
        documentParameters: JSON.stringify(
          { 
            DurationSeconds: '120',
            InstallDependencies: 'True',
            CPU: '0'
          } 
        ),
        duration: 'PT2M'
      },
      targets: { Instances: 'instanceTargets' }
    }

    // Experiments
    const templateStopStartInstance = new fis.CfnExperimentTemplate(this, 'fis-template-stop-instances-in-asg-az',
      {
        description: 'Stop and restart all instances of ASG in particular AZ',
        roleArn: importedFISRoleArn.toString(),
        stopConditions: [{
          source: 'aws:cloudwatch:alarm',
          value: importedStopConditionArn.toString()
        }],
        tags: { 
          Name: 'FIS Experiment',
          Stackname: this.stackName
        },
        actions: {
          'instanceActions' : stopInstanceAction
        },
        targets: {
          'instanceTargets': TargetAllInstancesASGAZ
        }
      }
    );  

    const templateCPUStress = new fis.CfnExperimentTemplate(this, 'fis-template-CPU-stress-random-instances-in-vpc',
      {
        description: 'Runs CPU stress on all instances of an ASG using the stress-ng tool. Uses the AWS FIS provided document - AWSFIS-Run-CPU-Stress',
        roleArn: importedFISRoleArn.toString(),
        stopConditions: [{
          source: 'aws:cloudwatch:alarm',
          value: importedStopConditionArn.toString()
        }],
        tags: { 
          Name: 'FIS Experiment',
          Stackname: this.stackName
        },
        actions: {
          'instanceActions' : cpuStressAction
        },
        targets: {
          'instanceTargets': TargetAllInstancesASG
        }
      }
    );

  }
}
